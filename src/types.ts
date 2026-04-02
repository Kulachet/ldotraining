import { Timestamp } from 'firebase/firestore';

export interface AcademicYear {
  id: string;
  year: string;
  status: 'active' | 'archived';
}

export interface Course {
  id: string;
  title: string;
  academicYearId: string;
  date: Timestamp;
  startTime: string;
  endTime: string;
  speaker: string;
  description: string;
  maxParticipants: number;
  room?: string;
  published: boolean;
  posterUrl?: string;
  registrationCount?: number;
}

export interface InstructorMaster {
  instructorId: string;
  position: string;
  name: string;
  email: string;
  phone: string;
  department: string;
}

export interface Registration {
  id: string;
  instructorId: string;
  courseId: string;
  academicYearId: string;
  timestamp: Timestamp;
  instructorName: string;
  instructorPosition: string;
  department: string;
  instructorEmail: string;
  sequenceNumber?: number;
  attended?: boolean;
  attendanceTimestamp?: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

export interface Evaluation {
  id?: string;
  courseId: string;
  ratings: number[]; // Array of 10 ratings (1-5)
  suggestion: string;
  timestamp: any;
  submitterEmail?: string;
  submitterName?: string;
}
