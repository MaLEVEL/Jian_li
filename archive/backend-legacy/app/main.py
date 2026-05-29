from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, desc, select

from app.database import get_session, init_db
from app.models import Analysis, Application, InterviewQuestionSet, Job, Resume, utc_now
from app.schemas import (
    AnalysisCreate,
    AnalysisRead,
    ApplicationPageRead,
    ApplicationRead,
    ApplicationStatusUpdate,
    HealthRead,
    InterviewQuestionsCreate,
    InterviewQuestionsRecordRead,
    InterviewQuestionsRead,
    JobCreate,
    JobRead,
    ResumeRead,
)
from app.services.ai_client import AIClient
from app.services.resume_parser import parse_resume_file

ANALYSIS_CACHE_WINDOW = timedelta(minutes=5)
MAX_ANALYSES_PER_APPLICATION = 5
MAX_APPLICATION_PAGE_SIZE = 100


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not getattr(app.state, "skip_db_init", False):
        init_db()
    yield


app = FastAPI(title="JobFit AI API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthRead)
def health() -> HealthRead:
    return HealthRead(status="ok")


@app.post("/api/resumes", response_model=ResumeRead, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile,
    session: Session = Depends(get_session),
) -> Resume:
    text = await parse_resume_file(file)
    content_hash = sha256(text.encode("utf-8")).hexdigest()
    existing_resume = session.exec(
        select(Resume).where(Resume.content_hash == content_hash)
    ).first()
    if existing_resume:
        return existing_resume

    resume = Resume(filename=file.filename or "resume", text=text, content_hash=content_hash)
    session.add(resume)
    session.commit()
    session.refresh(resume)
    return resume


@app.post("/api/jobs", response_model=JobRead, status_code=status.HTTP_201_CREATED)
def create_job(payload: JobCreate, session: Session = Depends(get_session)) -> Job:
    job = Job(
        company=payload.company.strip(),
        title=payload.title.strip(),
        description=payload.description,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@app.put("/api/jobs/{job_id}", response_model=JobRead)
def update_job(
    job_id: int,
    payload: JobCreate,
    session: Session = Depends(get_session),
) -> Job:
    job = _get_or_404(session, Job, job_id, "Job not found")
    job.company = payload.company.strip()
    job.title = payload.title.strip()
    job.description = payload.description
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@app.delete("/api/resumes/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume(resume_id: int, session: Session = Depends(get_session)) -> None:
    resume = _get_or_404(session, Resume, resume_id, "Resume not found")
    _delete_applications_for_resume(session, resume.id)
    session.delete(resume)
    session.commit()
    return None


@app.delete("/api/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: int, session: Session = Depends(get_session)) -> None:
    job = _get_or_404(session, Job, job_id, "Job not found")
    _delete_applications_for_job(session, job.id)
    session.delete(job)
    session.commit()
    return None


@app.post("/api/analysis", response_model=AnalysisRead, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    payload: AnalysisCreate,
    session: Session = Depends(get_session),
) -> Analysis:
    resume = _get_or_404(session, Resume, payload.resume_id, "Resume not found")
    job = _get_or_404(session, Job, payload.job_id, "Job not found")
    application = _get_or_create_application(session, resume.id, job.id)

    if payload.replace_existing:
        _delete_existing_analyses(session, application.id)
    else:
        latest_analysis = _latest_analysis(session, application.id)
        if latest_analysis and not payload.force and _is_recent(latest_analysis.created_at):
            return latest_analysis

    ai_payload = await AIClient().analyze_fit(resume, job)
    analysis = Analysis(
        resume_id=resume.id,
        job_id=job.id,
        application_id=application.id,
        match_score=ai_payload["match_score"],
        strengths=ai_payload["strengths"],
        gaps=ai_payload["gaps"],
        suggestions=ai_payload["suggestions"],
        optimized_bullets=ai_payload["optimized_bullets"],
    )
    session.add(analysis)
    session.commit()
    session.refresh(analysis)
    _prune_old_analyses(session, application.id, keep=MAX_ANALYSES_PER_APPLICATION)
    return analysis


@app.delete("/api/analysis/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis(analysis_id: int, session: Session = Depends(get_session)) -> None:
    analysis = _get_or_404(session, Analysis, analysis_id, "Analysis not found")
    session.delete(analysis)
    session.commit()
    return None


@app.get("/api/applications", response_model=ApplicationPageRead)
def list_applications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=MAX_APPLICATION_PAGE_SIZE),
    session: Session = Depends(get_session),
) -> ApplicationPageRead:
    total = len(session.exec(select(Application.id)).all())
    applications = session.exec(
        select(Application).order_by(desc(Application.updated_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return ApplicationPageRead(
        items=[_application_to_read(session, application) for application in applications],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@app.patch("/api/applications/{application_id}", response_model=ApplicationRead)
def update_application_status(
    application_id: int,
    payload: ApplicationStatusUpdate,
    session: Session = Depends(get_session),
) -> ApplicationRead:
    application = _get_or_404(session, Application, application_id, "Application not found")
    application.status = payload.status
    application.updated_at = utc_now()
    session.add(application)
    session.commit()
    session.refresh(application)
    return _application_to_read(session, application)


@app.post("/api/interview-questions", response_model=InterviewQuestionsRead)
async def create_interview_questions(
    payload: InterviewQuestionsCreate,
    session: Session = Depends(get_session),
) -> InterviewQuestionsRead:
    resume = _get_or_404(session, Resume, payload.resume_id, "Resume not found")
    job = _get_or_404(session, Job, payload.job_id, "Job not found")
    application = _get_or_create_application(session, resume.id, job.id)
    questions_payload = await AIClient().interview_questions(resume, job)
    question_set = InterviewQuestionSet(
        resume_id=resume.id,
        job_id=job.id,
        application_id=application.id,
        technical=questions_payload["technical"],
        project=questions_payload["project"],
        behavioral=questions_payload["behavioral"],
    )
    application.updated_at = utc_now()
    session.add(question_set)
    session.add(application)
    session.commit()
    session.refresh(question_set)
    return InterviewQuestionsRead.model_validate(question_set, from_attributes=True)


def _application_to_read(session: Session, application: Application) -> ApplicationRead:
    resume = _get_or_404(session, Resume, application.resume_id, "Resume not found")
    job = _get_or_404(session, Job, application.job_id, "Job not found")
    latest_analysis = _latest_analysis(session, application.id)
    latest_interview_questions = session.exec(
        select(InterviewQuestionSet)
        .where(InterviewQuestionSet.application_id == application.id)
        .order_by(desc(InterviewQuestionSet.created_at))
    ).first()
    return ApplicationRead(
        id=application.id,
        resume_id=application.resume_id,
        job_id=application.job_id,
        status=application.status,
        created_at=application.created_at,
        updated_at=application.updated_at,
        resume=ResumeRead.model_validate(resume, from_attributes=True),
        job=JobRead.model_validate(job, from_attributes=True),
        latest_analysis=(
            AnalysisRead.model_validate(latest_analysis, from_attributes=True)
            if latest_analysis
            else None
        ),
        latest_interview_questions=(
            InterviewQuestionsRecordRead.model_validate(
                latest_interview_questions,
                from_attributes=True,
            )
            if latest_interview_questions
            else None
        ),
    )


def _get_or_create_application(session: Session, resume_id: int, job_id: int) -> Application:
    application = _find_application(session, resume_id, job_id)
    if application:
        application.updated_at = utc_now()
        session.add(application)
        session.commit()
        session.refresh(application)
        return application

    application = Application(
        resume_id=resume_id,
        job_id=job_id,
        status="saved",
    )
    session.add(application)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        application = _find_application(session, resume_id, job_id)
        if application is None:
            raise
        application.updated_at = utc_now()
        session.add(application)
        session.commit()
    session.refresh(application)
    return application


def _find_application(session: Session, resume_id: int, job_id: int) -> Application | None:
    return session.exec(
        select(Application).where(
            Application.resume_id == resume_id,
            Application.job_id == job_id,
        )
    ).first()


def _latest_analysis(session: Session, application_id: int) -> Analysis | None:
    return session.exec(
        select(Analysis)
        .where(Analysis.application_id == application_id)
        .order_by(desc(Analysis.created_at))
    ).first()


def _delete_existing_analyses(session: Session, application_id: int) -> None:
    analyses = session.exec(
        select(Analysis).where(Analysis.application_id == application_id)
    ).all()
    for analysis in analyses:
        session.delete(analysis)
    session.commit()


def _prune_old_analyses(session: Session, application_id: int, keep: int) -> None:
    analyses = session.exec(
        select(Analysis)
        .where(Analysis.application_id == application_id)
        .order_by(desc(Analysis.created_at), desc(Analysis.id))
    ).all()
    for analysis in analyses[keep:]:
        session.delete(analysis)
    session.commit()


def _delete_application_tree(session: Session, application: Application) -> None:
    for question_set in session.exec(
        select(InterviewQuestionSet).where(
            InterviewQuestionSet.application_id == application.id
        )
    ).all():
        session.delete(question_set)
    for analysis in session.exec(
        select(Analysis).where(Analysis.application_id == application.id)
    ).all():
        session.delete(analysis)
    session.delete(application)


def _delete_applications_for_resume(session: Session, resume_id: int) -> None:
    applications = session.exec(
        select(Application).where(Application.resume_id == resume_id)
    ).all()
    for application in applications:
        _delete_application_tree(session, application)


def _delete_applications_for_job(session: Session, job_id: int) -> None:
    applications = session.exec(
        select(Application).where(Application.job_id == job_id)
    ).all()
    for application in applications:
        _delete_application_tree(session, application)


def _is_recent(created_at: datetime) -> bool:
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return utc_now() - created_at <= ANALYSIS_CACHE_WINDOW


def _get_or_404(
    session: Session,
    model: type[Resume] | type[Job] | type[Application] | type[Analysis],
    item_id: int,
    message: str,
):
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return item
