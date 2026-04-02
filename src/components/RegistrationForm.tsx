import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, doc, getDoc, setDoc, Timestamp, orderBy, limit, deleteDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { AcademicYear, Course, InstructorMaster } from '../types';
import { Search, User, Building, CheckCircle, AlertCircle, Loader2, ClipboardCheck, Clock, Image as ImageIcon, Calendar, Trash2, History, X, LogOut } from 'lucide-react';
import { formatDate, formatInstructorName } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { signOut } from 'firebase/auth';

import { User as FirebaseUser } from 'firebase/auth';

interface Props {
  academicYears: AcademicYear[];
  courses: Course[];
  user: FirebaseUser | null;
}

interface RegistrationResult {
  courseTitle: string;
  sequenceNumber: number;
  maxParticipants: number;
}

export default function RegistrationForm({ academicYears, courses, user }: Props) {
  const [instructorId, setInstructorId] = useState('');
  const [instructor, setInstructor] = useState<InstructorMaster | null>(null);
  const [searching, setSearching] = useState(false);
  const [isRegisteringNew, setIsRegisteringNew] = useState(false);
  const [newInstructorForm, setNewInstructorForm] = useState({
    instructorId: '',
    position: 'อาจารย์ประจำ',
    name: '',
    email: '',
    phone: '',
    department: ''
  });
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [registrationResults, setRegistrationResults] = useState<RegistrationResult[]>([]);
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});
  const [userRegistrations, setUserRegistrations] = useState<any[]>([]);
  const [loadingUserRegs, setLoadingUserRegs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedPoster, setExpandedPoster] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<{ isOpen: boolean; regId: string | null }>({
    isOpen: false,
    regId: null
  });

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourseIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId) 
        : [...prev, courseId]
    );
  };

  // Fetch registration counts for all courses in real-time
  useEffect(() => {
    const q = collection(db, 'registrations');
    const unsubscribe = onSnapshot(q, (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.courseId) {
          counts[data.courseId] = (counts[data.courseId] || 0) + 1;
        }
      });
      setRegistrationCounts(counts);
    }, (err) => {
      console.error('Error fetching registration counts:', err);
    });

    return () => unsubscribe();
  }, []);

  // Fetch user's own registrations
  useEffect(() => {
    if (!instructor) {
      setUserRegistrations([]);
      return;
    }

    setLoadingUserRegs(true);
    const q = query(
      collection(db, 'registrations'),
      where('instructorId', '==', instructor.instructorId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setUserRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingUserRegs(false);
    }, (err) => {
      console.error('Error fetching user registrations:', err);
      setLoadingUserRegs(false);
    });

    return () => unsubscribe();
  }, [instructor]);

  const handleCancelRegistration = async (regId: string) => {
    setConfirmCancel({ isOpen: true, regId });
  };

  const executeCancelRegistration = async () => {
    if (!confirmCancel.regId) return;
    
    try {
      await deleteDoc(doc(db, 'registrations', confirmCancel.regId));
      setConfirmCancel({ isOpen: false, regId: null });
    } catch (err) {
      console.error('Error cancelling registration:', err);
      setError('เกิดข้อผิดพลาดในการยกเลิกการลงทะเบียน');
      setConfirmCancel({ isOpen: false, regId: null });
    }
  };

  // Auto-lookup for logged-in user
  useEffect(() => {
    if (!user) return;

    const autoLookup = async () => {
      setSearching(true);
      setError(null);
      try {
        // 1. Try lookup by email (most accurate)
        if (user.email) {
          const qEmail = query(
            collection(db, 'instructors_master'),
            where('email', '==', user.email.trim()),
            limit(1)
          );
          const snapEmail = await getDocs(qEmail);
          if (!snapEmail.empty) {
            const data = snapEmail.docs[0].data() as InstructorMaster;
            setInstructor(data);
            setInstructorId(data.instructorId);
            return;
          }
        }

        // 2. Try lookup by name
        if (user.displayName) {
          const qName = query(
            collection(db, 'instructors_master'),
            where('name', '==', user.displayName.trim()),
            limit(1)
          );
          const snapName = await getDocs(qName);
          if (!snapName.empty) {
            const data = snapName.docs[0].data() as InstructorMaster;
            setInstructor(data);
            setInstructorId(data.instructorId);
            return;
          }
        }

        // 3. Final Fallback: Client-side search by name/email
        const allSnap = await getDocs(collection(db, 'instructors_master'));
        const found = allSnap.docs.find(d => {
          const data = d.data() as InstructorMaster;
          return (user.email && data.email?.toLowerCase() === user.email.toLowerCase()) ||
                 (user.displayName && data.name?.toLowerCase() === user.displayName.toLowerCase());
        });

        if (found) {
          const data = found.data() as InstructorMaster;
          setInstructor(data);
          setInstructorId(data.instructorId);
        } else {
          // If not found automatically, let them enter ID manually
          setError('ไม่พบข้อมูลอัตโนมัติจากบัญชี Google กรุณากรอกรหัสอาจารย์เพื่อยืนยันตัวตน หรือลงทะเบียนใหม่');
          setNewInstructorForm(prev => ({
            ...prev,
            name: user.displayName || '',
            email: user.email || ''
          }));
        }
      } catch (err) {
        console.error('Auto-lookup error:', err);
      } finally {
        setSearching(false);
      }
    };

    autoLookup();
  }, [user]);

  // ID Matching Logic (Manual)
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      const cleanId = instructorId.trim().toUpperCase();
      if (cleanId.length >= 5) {
        setSearching(true);
        setError(null);
        try {
          // Try direct ID lookup first (fastest)
          const docRef = doc(db, 'instructors_master', cleanId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setInstructor(docSnap.data() as InstructorMaster);
          } else {
            // Fallback: Search by field instructorId (more robust)
            const q = query(
              collection(db, 'instructors_master'), 
              where('instructorId', '==', cleanId),
              limit(1)
            );
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              setInstructor(querySnap.docs[0].data() as InstructorMaster);
            } else {
              // Final Fallback: Client-side search (fetch all and find)
              // This handles cases where Document ID or field matching might still fail due to hidden chars
              const allSnap = await getDocs(collection(db, 'instructors_master'));
              const found = allSnap.docs.find(d => {
                const data = d.data() as InstructorMaster;
                return d.id.toUpperCase() === cleanId || 
                       data.instructorId?.toUpperCase() === cleanId;
              });

              if (found) {
                setInstructor(found.data() as InstructorMaster);
              } else {
                setInstructor(null);
                setError('ไม่พบข้อมูลอาจารย์ในระบบ กรุณาตรวจสอบรหัสอาจารย์');
              }
            }
          }
        } catch (err) {
          console.error(err);
          setError('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
        } finally {
          setSearching(false);
        }
      } else {
        setInstructor(null);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [instructorId]);

  const handleRegisterNewInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const cleanId = newInstructorForm.instructorId.trim().toUpperCase();
      
      // Check if ID already exists
      const docRef = doc(db, 'instructors_master', cleanId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        throw new Error('รหัสอาจารย์นี้มีอยู่ในระบบแล้ว');
      }

      const instructorData: InstructorMaster = {
        ...newInstructorForm,
        instructorId: cleanId,
        name: newInstructorForm.name.trim(),
        email: newInstructorForm.email.trim(),
        status: 'active'
      };

      // Save to Firestore
      await setDoc(doc(db, 'instructors_master', cleanId), {
        ...instructorData,
        uid: user?.uid // Add UID for security rules
      });
      
      setInstructor(instructorData);
      setInstructorId(cleanId);
      setIsRegisteringNew(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'เกิดข้อผิดพลาดในการลงทะเบียนอาจารย์ใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setInstructor(null);
      setInstructorId('');
      setSelectedCourseIds([]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructor || selectedCourseIds.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const results: RegistrationResult[] = [];
      
      // Process each course registration sequentially to avoid race conditions and handle transactions properly
      for (const courseId of selectedCourseIds) {
        const selectedCourse = courses.find(c => c.id === courseId);
        if (!selectedCourse) continue;

        try {
          await runTransaction(db, async (transaction) => {
            // 1. Check for duplicate registration (within transaction context)
            // Note: query() cannot be used inside transaction.get(), so we check existence before or use a unique document ID
            // For simplicity and robustness, we'll use a specific document ID for registrations: courseId_instructorId
            const regId = `${courseId}_${instructor.instructorId}`;
            const regRef = doc(db, 'registrations', regId);
            const regSnap = await transaction.get(regRef);
            
            if (regSnap.exists()) return; // Already registered

            // 2. Get course data to get current count and check capacity
            const courseRef = doc(db, 'courses', courseId);
            const courseSnap = await transaction.get(courseRef);
            if (!courseSnap.exists()) throw new Error("ไม่พบข้อมูลหลักสูตร");

            const courseData = courseSnap.data();
            // Fallback to the real-time count if registrationCount is missing (for existing courses)
            let currentCount = courseData.registrationCount;
            if (currentCount === undefined) {
              currentCount = registrationCounts[courseId] || 0;
            }

            const nextSequence = currentCount + 1;

            // 3. Check capacity
            if (nextSequence > courseData.maxParticipants) {
              throw new Error(`หลักสูตร "${courseData.title}" ที่นั่งเต็มแล้ว`);
            }

            // 4. Create registration document with specific ID to prevent duplicates
            transaction.set(regRef, {
              instructorId: instructor.instructorId,
              courseId: courseId,
              academicYearId: selectedCourse.academicYearId,
              timestamp: Timestamp.now(),
              instructorName: formatInstructorName(instructor.name),
              instructorPosition: instructor.position,
              department: instructor.department,
              instructorEmail: instructor.email,
              sequenceNumber: nextSequence,
              uid: user?.uid
            });

            // 5. Update course registration count
            transaction.update(courseRef, {
              registrationCount: nextSequence
            });

            results.push({
              courseTitle: selectedCourse.title,
              sequenceNumber: nextSequence,
              maxParticipants: selectedCourse.maxParticipants
            });
          });

          // Create Google Calendar Event (outside transaction)
          try {
            await fetch('/api/calendar/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                instructorEmail: instructor.email,
                instructorName: instructor.name,
                courseTitle: selectedCourse.title,
                courseDate: selectedCourse.date.toDate().toISOString().split('T')[0],
                startTime: selectedCourse.startTime,
                endTime: selectedCourse.endTime,
                courseRoom: selectedCourse.room,
              }),
            });
          } catch (calErr) {
            console.error('Failed to create calendar event:', calErr);
          }
        } catch (err: any) {
          console.error(`Error registering for course ${courseId}:`, err);
          throw new Error(err.message || 'เกิดข้อผิดพลาดในการลงทะเบียน');
        }
      }

      setRegistrationResults(results);
      setSelectedCourseIds([]);
      setSuccessMessage('ลงทะเบียนสำเร็จ! คุณสามารถตรวจสอบรายการที่ลงทะเบียนแล้วได้ที่ส่วน "หลักสูตรที่คุณลงทะเบียนแล้ว"');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 serif mb-2">ลงทะเบียนอบรม</h1>
        <p className="text-gray-500">กรุณากรอกรหัสอาจารย์เพื่อตรวจสอบข้อมูลและเลือกหลักสูตรที่ต้องการ</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-6">
        {/* Step 1: Instructor ID */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Search className="text-primary w-4 h-4" />
            </div>
            <h3 className="font-bold serif">ขั้นตอนที่ 1: ตรวจสอบข้อมูลอาจารย์</h3>
          </div>

          <div className="space-y-4">
            {!instructor && !isRegisteringNew && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase">รหัสอาจารย์ (Instructor ID)</label>
                  <button 
                    type="button"
                    onClick={() => setIsRegisteringNew(true)}
                    className="text-xs text-primary font-bold hover:underline"
                  >
                    + ลงทะเบียนอาจารย์ใหม่
                  </button>
                </div>
                <div className="relative">
                  <input 
                    required
                    type="text" 
                    placeholder="เช่น 6012345"
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 pl-12 focus:ring-2 focus:ring-primary/20 focus:border-primary text-lg font-bold outline-none transition-all"
                    value={instructorId}
                    onChange={e => setInstructorId(e.target.value)}
                  />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  {searching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5 animate-spin" />}
                </div>
              </div>
            )}

            {!instructor && isRegisteringNew && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 border-t border-gray-100 pt-4"
              >
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-primary">ลงทะเบียนข้อมูลอาจารย์ใหม่</h4>
                  <button 
                    type="button"
                    onClick={() => setIsRegisteringNew(false)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    ยกเลิก
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">รหัสอาจารย์</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={newInstructorForm.instructorId}
                      onChange={e => setNewInstructorForm({...newInstructorForm, instructorId: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">ตำแหน่ง</label>
                    <input 
                      required
                      type="text"
                      placeholder="อาจารย์ประจำ"
                      className={`w-full bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none ${newInstructorForm.position === 'อาจารย์ประจำ' ? 'text-gray-400' : 'text-gray-900'}`}
                      value={newInstructorForm.position}
                      onChange={e => setNewInstructorForm({...newInstructorForm, position: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">ชื่อ-นามสกุล</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={newInstructorForm.name}
                      onChange={e => setNewInstructorForm({...newInstructorForm, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Email</label>
                    <input 
                      required
                      type="email"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={newInstructorForm.email}
                      onChange={e => setNewInstructorForm({...newInstructorForm, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">เบอร์โทรศัพท์</label>
                    <input 
                      required
                      type="tel"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={newInstructorForm.phone}
                      onChange={e => setNewInstructorForm({...newInstructorForm, phone: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">หน่วยงาน</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={newInstructorForm.department}
                      onChange={e => setNewInstructorForm({...newInstructorForm, department: e.target.value})}
                    />
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={handleRegisterNewInstructor}
                  disabled={submitting}
                  className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูลอาจารย์'}
                </button>
              </motion.div>
            )}

            <AnimatePresence>
              {instructor && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> ยืนยันตัวตนสำเร็จ
                    </span>
                    <button 
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-[10px] text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-full font-bold transition-colors border border-red-100"
                    >
                      <LogOut className="w-3 h-3" />
                      ออกจากระบบ
                    </button>
                  </div>
                  
                  <div className="bg-gray-50 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <User className="text-primary w-5 h-5" />
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">ชื่อ-นามสกุล</p>
                        <p className="font-bold text-gray-900">{formatInstructorName(instructor.name)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{instructor.position}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Building className="text-primary w-5 h-5" />
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">หน่วยงาน</p>
                        <p className="font-bold">{instructor.department}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <AlertCircle className="text-primary w-5 h-5" />
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">อีเมล์ / โทรศัพท์</p>
                        <p className="font-bold">{instructor.email} | {instructor.phone || '-'}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* My Registrations Section (Permanent when identified) */}
        {instructor && (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <History className="text-primary w-4 h-4" />
                </div>
                <h3 className="font-bold serif">หลักสูตรที่คุณลงทะเบียนแล้ว</h3>
              </div>
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                {userRegistrations.length} หลักสูตร
              </span>
            </div>

            {userRegistrations.length === 0 ? (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-sm italic">คุณยังไม่ได้ลงทะเบียนหลักสูตรใดๆ</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userRegistrations.map((reg) => {
                  const course = courses.find(c => c.id === reg.courseId);
                  return (
                    <div key={reg.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900 text-sm mb-1 line-clamp-1">{course?.title || 'Unknown Course'}</h4>
                        <div className="flex items-center gap-3 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" /> {course ? formatDate(course.date) : '-'}
                          </span>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleCancelRegistration(reg.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        ยกเลิก
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Course Selection */}
        <div className={`bg-white rounded-3xl p-8 shadow-sm border border-gray-100 transition-opacity ${!instructor ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <ClipboardCheck className="text-primary w-4 h-4" />
              </div>
              <h3 className="font-bold serif">ขั้นตอนที่ 2: เลือกหลักสูตรอบรม</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {courses.filter(c => {
              const year = academicYears.find(y => y.id === c.academicYearId);
              return year?.status === 'active' && c.published === true;
            }).map(course => {
              const currentCount = registrationCounts[course.id] || 0;
              const remainingSeats = Math.max(0, course.maxParticipants - currentCount);
              const isFull = remainingSeats <= 0;
              const isSelected = selectedCourseIds.includes(course.id);
              const isAlreadyRegistered = userRegistrations.some(r => r.courseId === course.id);

              return (
                <div 
                  key={course.id}
                  className={`relative rounded-3xl p-6 border-2 transition-all overflow-hidden ${
                    isAlreadyRegistered
                      ? 'border-orange-100 bg-orange-50/30 cursor-default'
                      : isFull 
                        ? 'border-red-100 bg-red-50/50 opacity-75 cursor-not-allowed'
                        : isSelected 
                          ? 'border-green-600 bg-green-50 ring-4 ring-green-50' 
                          : 'border-gray-100 bg-white shadow-sm'
                  }`}
                >
                  {isFull && !isAlreadyRegistered && (
                    <div className="absolute top-4 right-4 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                      ที่นั่งเต็ม
                    </div>
                  )}
                  {isAlreadyRegistered && (
                    <div className="absolute top-4 right-4 z-10 bg-orange-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> ลงทะเบียนแล้ว
                    </div>
                  )}
                  <div className="flex flex-col md:flex-row gap-8">
                  {/* Left: Large Image */}
                  <div 
                    className="w-full md:w-64 h-80 md:h-auto rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100 border border-gray-100 shadow-inner relative group cursor-zoom-in"
                    onClick={(e) => {
                      if (course.posterUrl) {
                        e.stopPropagation();
                        setExpandedPoster(course.posterUrl);
                      }
                    }}
                  >
                    {course.posterUrl ? (
                      <img 
                        src={course.posterUrl} 
                        alt={course.title} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">No Poster</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Information */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{formatDate(course.date)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <Clock className="w-4 h-4" />
                            <span className="text-xs font-bold">{course.startTime} - {course.endTime}</span>
                          </div>
                        </div>
                        <h4 className="text-2xl font-bold serif text-gray-900 leading-tight">{course.title}</h4>
                      </div>
                      {selectedCourseIds.includes(course.id) && (
                        <div className="bg-primary text-white p-2 rounded-full shadow-lg shadow-primary/20">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-3 text-gray-600">
                        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100">
                          <User className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">วิทยากร</p>
                          <p className="text-sm font-bold">{course.speaker}</p>
                        </div>
                      </div>

                      {course.room && (
                        <div className="flex items-center gap-3 text-gray-600">
                          <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100">
                            <Building className="w-4 h-4 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">สถานที่ / ห้อง</p>
                            <p className="text-sm font-bold">{course.room}</p>
                          </div>
                        </div>
                      )}

                      {course.description && (
                        <div className="pt-4 border-t border-gray-50">
                          <p className="text-xs text-gray-500 leading-relaxed italic whitespace-pre-wrap">
                            "{course.description}"
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-8">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">รับจำนวน</p>
                          <p className="text-sm font-black text-gray-900">{course.maxParticipants} ท่าน</p>
                        </div>
                        <div className="text-center border-l border-gray-100 pl-8">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">คงเหลือ</p>
                          <p className={`text-sm font-black ${remainingSeats <= 5 ? 'text-red-500' : 'text-green-600'}`}>
                            {remainingSeats} ที่นั่ง
                          </p>
                        </div>
                      </div>
                      
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isFull && !isAlreadyRegistered) {
                            toggleCourseSelection(course.id);
                          }
                        }}
                        disabled={isFull || isAlreadyRegistered}
                        className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                          isAlreadyRegistered
                            ? 'bg-orange-500 text-white shadow-lg shadow-orange-100 cursor-default'
                            : isFull
                              ? 'bg-red-500 text-white cursor-not-allowed'
                              : isSelected 
                                ? 'bg-green-700 text-white ring-2 ring-green-200 hover:bg-green-800' 
                                : 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-100'
                        }`}
                      >
                        {isAlreadyRegistered ? 'ลงทะเบียนแล้ว' : isFull ? 'ที่นั่งเต็ม' : isSelected ? 'เลือกแล้ว' : 'คลิกเพื่อเลือก'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
            <AlertCircle className="text-red-600 w-5 h-5" />
            <p className="text-red-800 text-sm font-bold">{error}</p>
          </div>
        )}

        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3"
          >
            <CheckCircle className="text-green-600 w-5 h-5" />
            <p className="text-green-800 text-sm font-bold">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-400 hover:text-green-600">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Confirmation Modal */}
        <AnimatePresence>
          {expandedPoster && (
            <div 
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out"
              onClick={() => setExpandedPoster(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => setExpandedPoster(null)}
                  className="absolute -top-12 right-0 text-white hover:text-primary transition-colors p-2 bg-white/10 rounded-full backdrop-blur-sm"
                >
                  <X className="w-8 h-8" />
                </button>
                <img 
                  src={expandedPoster} 
                  alt="Expanded Poster" 
                  className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </div>
          )}

          {confirmCancel.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-8 text-center"
              >
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="text-red-600 w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 serif">ยืนยันการยกเลิก</h3>
                <p className="text-gray-500 text-sm mb-8">คุณต้องการยกเลิกการลงทะเบียนในหลักสูตรนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setConfirmCancel({ isOpen: false, regId: null })}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    ย้อนกลับ
                  </button>
                  <button 
                    type="button"
                    onClick={executeCancelRegistration}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
                  >
                    ยืนยันยกเลิก
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <button 
          type="submit"
          disabled={!instructor || selectedCourseIds.length === 0 || submitting}
          className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg transition-all ${
            !instructor || selectedCourseIds.length === 0 || submitting
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-primary/20'
          }`}
        >
          {submitting ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              กำลังดำเนินการ...
            </div>
          ) : `ยืนยันการลงทะเบียน (${selectedCourseIds.length} หลักสูตร)`}
        </button>
      </form>
    </div>
  );
}
