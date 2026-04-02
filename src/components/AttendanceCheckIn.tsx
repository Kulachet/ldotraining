import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, Timestamp, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Course, InstructorMaster, Registration } from '../types';
import { CheckCircle2, Loader2, AlertCircle, LogIn, User, Building, GraduationCap, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatInstructorName } from '../utils';
import { User as FirebaseUser, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface Props {
  courseId: string | null;
  courses: Course[];
  user: FirebaseUser | null;
}

export default function AttendanceCheckIn({ courseId, courses, user }: Props) {
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [instructor, setInstructor] = useState<InstructorMaster | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  
  // Manual form state
  const [manualId, setManualId] = useState('');
  const [manualDept, setManualDept] = useState('');
  const [manualPos, setManualPos] = useState('');

  useEffect(() => {
    if (courseId) {
      const foundCourse = courses.find(c => c.id === courseId);
      setCourse(foundCourse || null);
    }
    
    if (user && user.email) {
      fetchInstructorData(user.email);
    } else {
      setLoading(false);
    }
  }, [courseId, courses, user]);

  const fetchInstructorData = async (email: string) => {
    try {
      setLoading(true);
      const q = query(collection(db, 'instructors_master'), where('email', '==', email));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        setInstructor(snap.docs[0].data() as InstructorMaster);
        setShowManualForm(false);
      } else {
        setInstructor(null);
        setShowManualForm(true);
      }
    } catch (err) {
      console.error("Error fetching instructor:", err);
      setError("ไม่สามารถดึงข้อมูลอาจารย์ได้");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
      setError("เข้าสู่ระบบไม่สำเร็จ");
    }
  };

  const handleCheckIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!course || !user) return;

    setCheckingIn(true);
    setError(null);

    try {
      let instructorData: Partial<InstructorMaster> = instructor || {
        instructorId: manualId.toUpperCase(),
        name: user.displayName || '',
        email: user.email || '',
        department: manualDept,
        position: manualPos
      };

      if (!instructorData.instructorId || !instructorData.department) {
        setError("กรุณากรอกข้อมูลให้ครบถ้วน");
        setCheckingIn(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const regId = `${course.id}_${instructorData.instructorId}`;
        const regRef = doc(db, 'registrations', regId);
        const regSnap = await transaction.get(regRef);

        if (regSnap.exists()) {
          // Already registered, just update attendance
          transaction.update(regRef, {
            attended: true,
            attendanceTimestamp: Timestamp.now()
          });
        } else {
          // Not registered, create new registration + attendance
          const courseRef = doc(db, 'courses', course.id);
          const courseSnap = await transaction.get(courseRef);
          if (!courseSnap.exists()) throw new Error("ไม่พบข้อมูลหลักสูตร");

          const courseData = courseSnap.data();
          const currentCount = courseData.registrationCount || 0;
          const nextSequence = currentCount + 1;

          transaction.set(regRef, {
            instructorId: instructorData.instructorId,
            courseId: course.id,
            academicYearId: course.academicYearId,
            timestamp: Timestamp.now(),
            instructorName: formatInstructorName(instructorData.name || ''),
            instructorPosition: instructorData.position || 'ไม่ระบุ',
            department: instructorData.department,
            instructorEmail: instructorData.email,
            sequenceNumber: nextSequence,
            attended: true,
            attendanceTimestamp: Timestamp.now(),
            uid: user.uid
          });

          transaction.update(courseRef, {
            registrationCount: nextSequence
          });
        }
      });

      setStatus('success');
    } catch (err: any) {
      console.error("Check-in error:", err);
      setError(err.message || "เกิดข้อผิดพลาดในการลงชื่อเข้าอบรม");
      setStatus('error');
    } finally {
      setCheckingIn(false);
    }
  };

  if (!courseId) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold serif">ไม่พบรหัสหลักสูตร</h2>
        <p className="text-gray-500 mt-2">กรุณาสแกน QR Code ใหม่อีกครั้ง</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">กำลังตรวจสอบข้อมูล...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto py-12 px-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border border-green-100"
        >
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="text-green-500 w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 serif mb-4">ลงชื่อเข้าอบรมสำเร็จ!</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            ระบบได้บันทึกการเข้าอบรมของท่านในหลักสูตร <br/>
            <span className="font-bold text-gray-900">"{course?.title}"</span> เรียบร้อยแล้ว
          </p>
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-3">
              <User className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">{instructor?.name || user?.displayName}</span>
            </div>
            <div className="flex items-center gap-3">
              <Building className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-600">{instructor?.department || manualDept}</span>
            </div>
          </div>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all uppercase tracking-widest text-sm"
          >
            กลับหน้าหลัก
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-primary p-8 text-white relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ShieldCheck className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Attendance Check-in</span>
          </div>
          <h2 className="text-2xl font-bold serif leading-tight">{course?.title}</h2>
          <p className="text-xs mt-2 opacity-80">กรุณาลงชื่อเพื่อยืนยันการเข้าอบรมในวันนี้</p>
        </div>

        <div className="p-8">
          {!user ? (
            <div className="text-center py-6">
              <p className="text-gray-500 mb-8 text-sm">กรุณาเข้าสู่ระบบด้วยบัญชี @bu.ac.th เพื่อลงชื่อเข้าอบรม</p>
              <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-4 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
              >
                <LogIn className="w-6 h-6 text-primary" />
                เข้าสู่ระบบด้วย Google
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                  alt="User" 
                  className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">ผู้เข้าอบรม</p>
                  <p className="font-bold text-gray-900">{user.displayName}</p>
                  <p className="text-[10px] text-gray-500">{user.email}</p>
                </div>
              </div>

              {showManualForm ? (
                <form onSubmit={handleCheckIn} className="space-y-4">
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-800 text-xs mb-4">
                    <p className="font-bold mb-1">ไม่พบข้อมูลอาจารย์ในระบบ Master Data</p>
                    <p>กรุณากรอกข้อมูลเพิ่มเติมเพื่อดำเนินการลงทะเบียนและเช็คอิน</p>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">รหัสอาจารย์</label>
                    <input 
                      type="text" 
                      required
                      placeholder="เช่น A6XXXX"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                      value={manualId}
                      onChange={e => setManualId(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">หน่วยงาน/คณะ</label>
                    <input 
                      type="text" 
                      required
                      placeholder="ระบุหน่วยงานของท่าน"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                      value={manualDept}
                      onChange={e => setManualDept(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">ตำแหน่ง</label>
                    <input 
                      type="text" 
                      placeholder="เช่น อาจารย์ประจำ"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                      value={manualPos}
                      onChange={e => setManualPos(e.target.value)}
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={checkingIn}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 mt-4"
                  >
                    {checkingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    {checkingIn ? 'กำลังเช็คอิน...' : 'ยืนยันการเข้าอบรม'}
                  </button>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-green-50 border border-green-100 rounded-2xl text-green-800 text-xs">
                    <p className="font-bold">ตรวจสอบข้อมูลเรียบร้อย</p>
                    <p className="mt-1">ท่านมีรายชื่อในระบบ Master Data แล้ว สามารถกดปุ่มยืนยันได้ทันที</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                      <span className="text-gray-400">รหัสอาจารย์</span>
                      <span className="font-bold text-gray-900">{instructor?.instructorId}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                      <span className="text-gray-400">หน่วยงาน</span>
                      <span className="font-bold text-gray-900">{instructor?.department}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleCheckIn()}
                    disabled={checkingIn}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                  >
                    {checkingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    {checkingIn ? 'กำลังเช็คอิน...' : 'ยืนยันการเข้าอบรม'}
                  </button>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-800 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="font-bold">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <p className="text-center mt-8 text-[10px] text-gray-400 uppercase tracking-widest">
        &copy; 2026 Bangkok University - Learning Development Office
      </p>
    </div>
  );
}
