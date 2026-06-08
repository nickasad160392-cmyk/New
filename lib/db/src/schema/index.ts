import { pgTable, serial, text, boolean, integer, timestamp, real } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"),
  jabatan: text("jabatan"),
  employeeId: text("employee_id").unique(),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  faceDescriptor: text("face_descriptor"),
  profilePhoto: text("profile_photo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  status: text("status").notNull().default("alpha"),
  checkInSelfie: text("check_in_selfie"),
  checkOutSelfie: text("check_out_selfie"),
  checkInLatitude: real("check_in_latitude"),
  checkInLongitude: real("check_in_longitude"),
  checkInAccuracy: real("check_in_accuracy"),
  workMinutes: integer("work_minutes"),
  overtimeMinutes: integer("overtime_minutes"),
  latenessMinutes: integer("lateness_minutes"),
  overtimeCheckInTime: timestamp("overtime_check_in_time"),
  overtimeCheckOutTime: timestamp("overtime_check_out_time"),
  overtimeCheckInSelfie: text("overtime_check_in_selfie"),
  overtimeExtraMinutes: integer("overtime_extra_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  title: text("title").notNull(),
  target: text("target"),
  isCompleted: boolean("is_completed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  period: text("period").notNull(),
  periodType: text("period_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetValue: integer("target_value").notNull().default(100),
  progressValue: integer("progress_value").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type DailyTask = typeof dailyTasks.$inferSelect;
export type Goal = typeof goals.$inferSelect;
