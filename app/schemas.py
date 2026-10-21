from datetime import date, datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import AttendanceStatus, EmployeeStatus, LeaveStatus, LeaveType, Role


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterInput(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=160)


class LoginInput(BaseModel):
    username: str
    password: str


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role

    @model_validator(mode="after")
    def privileged_role_only(self):
        if self.role == Role.EMPLOYEE:
            raise ValueError("Use employee onboarding for employee accounts")
        return self


class UserOut(ORMModel):
    id: int
    username: str
    email: EmailStr
    role: Role


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class EmployeeCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=160)
    designation: str = Field(min_length=1, max_length=120)
    department: str = Field(min_length=1, max_length=120)
    joining_date: date
    salary: float = Field(ge=0)


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    designation: str | None = Field(default=None, min_length=1, max_length=120)
    department: str | None = Field(default=None, min_length=1, max_length=120)
    joining_date: date | None = None
    salary: float | None = Field(default=None, ge=0)
    status: EmployeeStatus | None = None


class EmployeeOut(ORMModel):
    id: int
    user_id: int
    full_name: str
    designation: str
    department: str
    joining_date: date
    salary: float
    status: EmployeeStatus
    username: str = ""
    email: EmailStr = ""


class AttendanceMark(BaseModel):
    employee_id: int
    date: date
    status: AttendanceStatus
    check_in: datetime | None = None
    check_out: datetime | None = None


class AttendanceOut(ORMModel):
    id: int
    employee_id: int
    check_in: datetime | None
    check_out: datetime | None
    date: date
    status: AttendanceStatus
    working_hours: float = 0
    employee_name: str = ""


class LeaveCreate(BaseModel):
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def valid_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class LeaveReview(BaseModel):
    status: Literal[LeaveStatus.APPROVED, LeaveStatus.REJECTED]


class LeaveOut(ORMModel):
    id: int
    employee_id: int
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str
    status: LeaveStatus
    created_at: datetime
    employee_name: str = ""


class PayrollCreate(BaseModel):
    employee_id: int
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    basic_salary: float = Field(ge=0)
    deductions: float = Field(default=0, ge=0)
    bonus: float = Field(default=0, ge=0)

    @model_validator(mode="after")
    def deductions_within_gross_pay(self):
        if self.deductions > self.basic_salary + self.bonus:
            raise ValueError("deductions cannot exceed basic salary plus bonus")
        return self


class PayrollOut(ORMModel):
    id: int
    employee_id: int
    basic_salary: float
    deductions: float
    bonus: float
    net_salary: float
    month: str
    created_at: datetime
    employee_name: str = ""


class NotificationOut(ORMModel):
    id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime
