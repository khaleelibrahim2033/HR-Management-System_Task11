from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import Attendance, AttendanceStatus, Employee, EmployeeStatus, Leave, LeaveStatus, Notification, Payroll, Role, User
from .schemas import (
    AdminUserCreate, AttendanceMark, AttendanceOut, EmployeeCreate, EmployeeOut, EmployeeUpdate, LeaveCreate, LeaveOut, LeaveReview,
    NotificationOut, PayrollCreate, PayrollOut, RegisterInput, TokenOut, UserOut,
)
from .security import create_access_token, hash_password, verify_password

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bootstrap_admin()
    yield


app = FastAPI(
    title="WorkSphere HRMS",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Health", "description": "Service status"},
        {"name": "Auth", "description": "Registration, sign-in, and user accounts"},
        {"name": "Employees", "description": "Employee profiles and directory"},
        {"name": "Attendance", "description": "Check-in, check-out, and attendance records"},
        {"name": "Leaves", "description": "Leave requests and approvals"},
        {"name": "Payroll", "description": "Payroll records and payslips"},
        {"name": "Notifications", "description": "Personal notifications"},
        {"name": "Dashboard", "description": "HR and administrator analytics"},
    ],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.frontend_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


def require_roles(*roles: Role):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return user
    return dependency


def get_employee(db: Session, user: User) -> Employee:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


def employee_out(employee: Employee) -> dict:
    return {
        "id": employee.id, "user_id": employee.user_id, "full_name": employee.full_name,
        "designation": employee.designation, "department": employee.department,
        "joining_date": employee.joining_date, "salary": employee.salary, "status": employee.status,
        "username": employee.user.username, "email": employee.user.email,
    }


def attendance_out(row: Attendance) -> dict:
    hours = 0.0
    if row.check_in and row.check_out:
        start = row.check_in.replace(tzinfo=timezone.utc) if row.check_in.tzinfo is None else row.check_in
        end = row.check_out.replace(tzinfo=timezone.utc) if row.check_out.tzinfo is None else row.check_out
        hours = round(max(0, (end - start).total_seconds()) / 3600, 2)
    return {"id": row.id, "employee_id": row.employee_id, "check_in": row.check_in, "check_out": row.check_out,
            "date": row.date, "status": row.status, "working_hours": hours, "employee_name": row.employee.full_name}


def leave_out(row: Leave) -> dict:
    return {"id": row.id, "employee_id": row.employee_id, "leave_type": row.leave_type,
            "start_date": row.start_date, "end_date": row.end_date, "reason": row.reason,
            "status": row.status, "created_at": row.created_at, "employee_name": row.employee.full_name}


def payroll_out(row: Payroll) -> dict:
    return {"id": row.id, "employee_id": row.employee_id, "basic_salary": row.basic_salary,
            "deductions": row.deductions, "bonus": row.bonus, "net_salary": row.net_salary,
            "month": row.month, "created_at": row.created_at, "employee_name": row.employee.full_name}


def notify(db: Session, user_id: int, title: str, message: str) -> None:
    db.add(Notification(user_id=user_id, title=title, message=message))


def bootstrap_admin() -> None:
    if not (settings.bootstrap_admin_username and settings.bootstrap_admin_email and settings.bootstrap_admin_password):
        return
    with SessionLocal() as db:
        exists = db.scalar(select(User).where(User.role == Role.ADMIN))
        if exists is None:
            db.add(User(username=settings.bootstrap_admin_username, email=settings.bootstrap_admin_email,
                        hashed_password=hash_password(settings.bootstrap_admin_password), role=Role.ADMIN))
            db.commit()


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


@app.post("/auth/register", response_model=TokenOut, status_code=201, tags=["Auth"])
def register(payload: RegisterInput, db: Session = Depends(get_db)):
    user = User(username=payload.username.lower(), email=payload.email.lower(), hashed_password=hash_password(payload.password), role=Role.EMPLOYEE)
    db.add(user)
    try:
        db.flush()
        db.add(Employee(user_id=user.id, full_name=payload.full_name, designation="Employee",
                        department="Unassigned", joining_date=date.today(), salary=0))
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    return {"access_token": create_access_token(user), "user": user}


@app.post("/auth/login", response_model=TokenOut, tags=["Auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.username) == form_data.username.lower()))
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
    return {"access_token": create_access_token(user), "user": user}


@app.get("/auth/me", response_model=UserOut, tags=["Auth"])
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/auth/users", response_model=UserOut, status_code=201, tags=["Auth"])
def create_privileged_user(payload: AdminUserCreate, user: User = Depends(require_roles(Role.ADMIN)), db: Session = Depends(get_db)):
    account = User(username=payload.username.lower(), email=payload.email.lower(),
                   hashed_password=hash_password(payload.password), role=payload.role)
    db.add(account)
    try:
        db.commit()
        db.refresh(account)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    return account


@app.get("/employees", response_model=list[EmployeeOut], tags=["Employees"])
def list_employees(search: str | None = None, department: str | None = None, status_filter: EmployeeStatus | None = Query(default=None, alias="status"),
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(Employee).join(User)
    if user.role == Role.EMPLOYEE:
        query = query.where(Employee.user_id == user.id)
    if search:
        query = query.where(func.lower(Employee.full_name).contains(search.lower()))
    if department:
        query = query.where(func.lower(Employee.department) == department.lower())
    if status_filter:
        query = query.where(Employee.status == status_filter)
    return [employee_out(row) for row in db.scalars(query.order_by(Employee.full_name)).all()]


@app.post("/employees", response_model=EmployeeOut, status_code=201, tags=["Employees"])
def create_employee(payload: EmployeeCreate, user: User = Depends(require_roles(Role.HR, Role.ADMIN)), db: Session = Depends(get_db)):
    account = User(username=payload.username.lower(), email=payload.email.lower(), hashed_password=hash_password(payload.password), role=Role.EMPLOYEE)
    db.add(account)
    try:
        db.flush()
        employee = Employee(user_id=account.id, full_name=payload.full_name, designation=payload.designation,
                            department=payload.department, joining_date=payload.joining_date, salary=payload.salary)
        db.add(employee)
        db.commit()
        db.refresh(employee)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    return employee_out(employee)


@app.get("/employees/{employee_id}", response_model=EmployeeOut, tags=["Employees"])
def get_employee_profile(employee_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user.role == Role.EMPLOYEE and employee.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own employee profile")
    return employee_out(employee)


@app.patch("/employees/{employee_id}", response_model=EmployeeOut, tags=["Employees"])
def update_employee(employee_id: int, payload: EmployeeUpdate, user: User = Depends(require_roles(Role.HR, Role.ADMIN)), db: Session = Depends(get_db)):
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    return employee_out(employee)


@app.post("/attendance/check-in", response_model=AttendanceOut, status_code=201, tags=["Attendance"])
def check_in(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = get_employee(db, user)
    if employee.status != EmployeeStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Inactive employees cannot check in")
    today = date.today()
    row = db.scalar(select(Attendance).where(Attendance.employee_id == employee.id, Attendance.date == today))
    if row and row.check_in:
        raise HTTPException(status_code=409, detail="You have already checked in today")
    if row is None:
        row = Attendance(employee_id=employee.id, date=today, status=AttendanceStatus.PRESENT, check_in=datetime.now(timezone.utc))
        db.add(row)
    else:
        row.check_in = datetime.now(timezone.utc)
        row.status = AttendanceStatus.PRESENT
    db.commit()
    db.refresh(row)
    return attendance_out(row)


@app.post("/attendance/check-out", response_model=AttendanceOut, tags=["Attendance"])
def check_out(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = get_employee(db, user)
    row = db.scalar(select(Attendance).where(Attendance.employee_id == employee.id, Attendance.date == date.today()))
    if row is None or row.check_in is None:
        raise HTTPException(status_code=400, detail="Check in before checking out")
    if row.check_out:
        raise HTTPException(status_code=409, detail="You have already checked out today")
    row.check_out = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return attendance_out(row)


@app.get("/attendance", response_model=list[AttendanceOut], tags=["Attendance"])
def list_attendance(employee_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(Attendance)
    if user.role == Role.EMPLOYEE:
        query = query.where(Attendance.employee_id == get_employee(db, user).id)
    elif employee_id:
        query = query.where(Attendance.employee_id == employee_id)
    return [attendance_out(row) for row in db.scalars(query.order_by(Attendance.date.desc(), Attendance.id.desc())).all()]


@app.post("/attendance/mark", response_model=AttendanceOut, status_code=201, tags=["Attendance"])
def mark_attendance(payload: AttendanceMark, user: User = Depends(require_roles(Role.HR, Role.ADMIN)), db: Session = Depends(get_db)):
    employee = db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    row = db.scalar(select(Attendance).where(Attendance.employee_id == payload.employee_id, Attendance.date == payload.date))
    if row is None:
        row = Attendance(employee_id=payload.employee_id, date=payload.date, status=payload.status,
                         check_in=payload.check_in, check_out=payload.check_out)
        db.add(row)
    else:
        row.status, row.check_in, row.check_out = payload.status, payload.check_in, payload.check_out
    if payload.status in (AttendanceStatus.ABSENT, AttendanceStatus.HALF_DAY):
        notify(db, employee.user_id, "Attendance updated",
               f"Your attendance for {payload.date} was marked {payload.status.value.lower().replace('_', ' ')}.")
    db.commit()
    db.refresh(row)
    return attendance_out(row)


@app.get("/leaves", response_model=list[LeaveOut], tags=["Leaves"])
def list_leaves(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(Leave)
    if user.role == Role.EMPLOYEE:
        query = query.where(Leave.employee_id == get_employee(db, user).id)
    return [leave_out(row) for row in db.scalars(query.order_by(Leave.created_at.desc())).all()]


@app.post("/leaves", response_model=LeaveOut, status_code=201, tags=["Leaves"])
def apply_leave(payload: LeaveCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = get_employee(db, user)
    if employee.status != EmployeeStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Inactive employees cannot apply for leave")
    row = Leave(employee_id=employee.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return leave_out(row)


@app.patch("/leaves/{leave_id}", response_model=LeaveOut, tags=["Leaves"])
def review_leave(leave_id: int, payload: LeaveReview, user: User = Depends(require_roles(Role.HR, Role.ADMIN)), db: Session = Depends(get_db)):
    row = db.get(Leave, leave_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only pending leave requests can be reviewed")
    row.status = payload.status
    notify(db, row.employee.user_id, f"Leave {payload.status.value.lower()}",
           f"Your {row.leave_type.value.lower()} leave request from {row.start_date} to {row.end_date} was {payload.status.value.lower()}.")
    db.commit()
    db.refresh(row)
    return leave_out(row)


@app.get("/payroll", response_model=list[PayrollOut], tags=["Payroll"])
def list_payroll(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(Payroll)
    if user.role == Role.EMPLOYEE:
        query = query.where(Payroll.employee_id == get_employee(db, user).id)
    return [payroll_out(row) for row in db.scalars(query.order_by(Payroll.month.desc())).all()]


@app.post("/payroll", response_model=PayrollOut, status_code=201, tags=["Payroll"])
def generate_payroll(payload: PayrollCreate, user: User = Depends(require_roles(Role.HR, Role.ADMIN)), db: Session = Depends(get_db)):
    employee = db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    if db.scalar(select(Payroll).where(Payroll.employee_id == payload.employee_id, Payroll.month == payload.month)):
        raise HTTPException(status_code=409, detail="Payroll already exists for this employee and month")
    row = Payroll(**payload.model_dump(), net_salary=round(payload.basic_salary - payload.deductions + payload.bonus, 2))
    db.add(row)
    notify(db, employee.user_id, "Payroll generated", f"Your payslip for {payload.month} is ready.")
    db.commit()
    db.refresh(row)
    return payroll_out(row)


@app.get("/notifications", response_model=list[NotificationOut], tags=["Notifications"])
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc())).all()


@app.patch("/notifications/{notification_id}/read", response_model=NotificationOut, tags=["Notifications"])
def read_notification(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.commit()
    db.refresh(row)
    return row


@app.get("/dashboard", tags=["Dashboard"])
def dashboard(user: User = Depends(require_roles(Role.HR, Role.ADMIN)), db: Session = Depends(get_db)):
    today = date.today()
    month = today.strftime("%Y-%m")
    return {
        "total_employees": db.scalar(select(func.count(Employee.id)).where(Employee.status == EmployeeStatus.ACTIVE)) or 0,
        "present_today": db.scalar(select(func.count(Attendance.id)).where(Attendance.date == today, Attendance.status == AttendanceStatus.PRESENT)) or 0,
        "pending_leaves": db.scalar(select(func.count(Leave.id)).where(Leave.status == LeaveStatus.PENDING)) or 0,
        "payroll_this_month": db.scalar(select(func.coalesce(func.sum(Payroll.net_salary), 0)).where(Payroll.month == month)) or 0,
        "attendance_breakdown": {state.value: db.scalar(select(func.count(Attendance.id)).where(Attendance.date == today, Attendance.status == state)) or 0 for state in AttendanceStatus},
        "leave_breakdown": {state.value: db.scalar(select(func.count(Leave.id)).where(Leave.status == state)) or 0 for state in LeaveStatus},
    }
