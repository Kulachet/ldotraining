import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, getDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Course, Registration } from '../types';
import { Star, Send, CheckCircle, AlertCircle, Loader2, GraduationCap, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User as FirebaseUser, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface Props {
  courseId: string | null;
  user: FirebaseUser | null;
}

const QUESTIONS = [
  "หัวข้อการอบรมมีความน่าสนใจและทันสมัย",
  "การอบรมครอบคลุมเนื้อหาได้ครบถ้วน",
  "เนื้อหาสาระและกิจกรรมของการอบรม เหมาะสม",
  "สามารถนำความรู้ที่ได้ ไปประยุกต์ใช้ได้จริง",
  "วิทยากรมีความรู้ ประสบการณ์ และเชี่ยวชาญในหัวข้อที่อบรมวิทยากรถ่ายทอดความรู้ได้ดี และมีกิจกรรมที่เหมาะสมกับหัวข้ออบรม",
  "วิทยากรถ่ายทอดความรู้ได้ดี และมีกิจกรรมที่เหมาะสมกับหัวข้ออบรม",
  "วิทยากรเปิดโอกาสให้มีส่วนร่วมและแสดงความคิดเห็นอย่างเพียงพอ",
  "วิทยากรคำนึงถึงความแตกต่างด้านทักษะและพื้นฐานของผู้เข้าอบรม",
  "ระยะเวลาในการอบรม เหมาะสมและสามารถครอบคลุมกิจกรรมต่างๆความรู้สึกพึงพอใจโดยรวมต่อการอบรมครั้งนี้",
  "ความรู้สึกพึงพอใจโดยรวมต่อการอบรมครั้งนี้"
];

export default function EvaluationForm({ courseId, user }: Props) {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEligible, setIsEligible] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  
  const [ratings, setRatings] = useState<number[]>(new Array(10).fill(0));
  const [suggestion, setSuggestion] = useState('');

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
      setError("เข้าสู่ระบบไม่สำเร็จ");
    }
  };

  useEffect(() => {
    if (!courseId) {
      setLoading(false);
      setError('ไม่พบรหัสหลักสูตร');
      return;
    }

    const checkEligibility = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch Course
        const courseRef = doc(db, 'courses', courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) {
          setError('ไม่พบข้อมูลหลักสูตร');
          setLoading(false);
          return;
        }
        setCourse({ id: courseSnap.id, ...courseSnap.data() } as Course);

        // 2. If user is logged in, check registration and attendance
        if (user && user.email) {
          // Check if registered and attended
          const regQ = query(
            collection(db, 'registrations'), 
            where('courseId', '==', courseId),
            where('instructorEmail', '==', user.email)
          );
          const regSnap = await getDocs(regQ);
          
          if (regSnap.empty) {
            setError('ท่านยังไม่ได้ลงทะเบียนสำหรับหลักสูตรนี้');
            setIsEligible(false);
          } else {
            const regData = regSnap.docs[0].data() as Registration;
            if (!regData.attended) {
              setError('ท่านยังไม่ได้ลงชื่อเข้าอบรม (Attendance) กรุณาเช็คอินก่อนทำแบบประเมิน');
              setIsEligible(false);
            } else {
              setIsEligible(true);
              
              // 3. Check if already submitted evaluation
              const evalQ = query(
                collection(db, 'evaluations'),
                where('courseId', '==', courseId),
                where('submitterEmail', '==', user.email)
              );
              const evalSnap = await getDocs(evalQ);
              if (!evalSnap.empty) {
                setAlreadySubmitted(true);
              }
            }
          }
        }
      } catch (err) {
        console.error(err);
        setError('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์');
      } finally {
        setLoading(false);
      }
    };

    checkEligibility();
  }, [courseId, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    if (ratings.some(r => r === 0)) {
      setError('กรุณาตอบคำถามให้ครบทุกข้อ');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await addDoc(collection(db, 'evaluations'), {
        courseId,
        ratings,
        suggestion: suggestion.trim(),
        timestamp: Timestamp.now(),
        submitterEmail: user.email,
        submitterName: user.displayName || 'ไม่ระบุ'
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <Loader2 className="animate-spin h-12 w-12 text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
        <div className="bg-white rounded-[2.5rem] p-12 shadow-xl max-w-md w-full text-center">
          <GraduationCap className="text-primary w-16 h-16 mx-auto mb-6" />
          <h2 className="text-2xl font-bold serif mb-4">กรุณาเข้าสู่ระบบ</h2>
          <p className="text-gray-500 mb-8">กรุณาเข้าสู่ระบบด้วยบัญชี @bu.ac.th เพื่อทำแบบประเมินผลการอบรม</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-4 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
          >
            <LogIn className="w-6 h-6 text-primary" />
            เข้าสู่ระบบด้วย Google
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2.5rem] p-12 shadow-xl max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-600 w-10 h-10" />
          </div>
          <h2 className="text-3xl font-bold serif mb-4">ส่งแบบประเมินสำเร็จ!</h2>
          <p className="text-gray-500 mb-8">ขอบคุณสำหรับความคิดเห็นของท่าน ข้อมูลนี้จะเป็นประโยชน์อย่างยิ่งในการพัฒนาการอบรมครั้งต่อไป</p>
          <p className="text-xs text-gray-400 uppercase tracking-widest">BU Academic Training</p>
        </motion.div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
        <div className="bg-white rounded-[2.5rem] p-12 shadow-xl max-w-md w-full text-center">
          <CheckCircle className="text-green-500 w-16 h-16 mx-auto mb-6" />
          <h2 className="text-2xl font-bold serif mb-4">ท่านส่งแบบประเมินแล้ว</h2>
          <p className="text-gray-500">ท่านได้ส่งแบบประเมินสำหรับหลักสูตร "{course?.title}" เรียบร้อยแล้ว ขอบคุณครับ</p>
        </div>
      </div>
    );
  }

  if (error && !isEligible) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
        <div className="bg-white rounded-[2.5rem] p-12 shadow-xl max-w-md w-full text-center">
          <AlertCircle className="text-red-500 w-16 h-16 mx-auto mb-6" />
          <h2 className="text-2xl font-bold serif mb-4">ไม่สามารถทำแบบประเมินได้</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <p className="text-xs text-gray-400">หากท่านคิดว่านี่คือข้อผิดพลาด กรุณาติดต่อเจ้าหน้าที่</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <GraduationCap className="text-white w-7 h-7" />
            </div>
            <div className="text-left">
              <h1 className="font-bold text-xl serif leading-tight text-gray-900">แบบประเมินผลการอบรม</h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Learning Development Office</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold serif text-primary mb-4">{course?.title}</h2>
          <p className="text-gray-500 text-sm max-w-xl mx-auto">
            ท่านมีความคิดเห็นอย่างไรต่อข้อความต่อไปนี้ โดย 5 หมายถึง มากที่สุด, 4 หมายถึง มาก, 3 หมายถึง ปานกลาง, 2 หมายถึง น้อย และ 1 หมายถึง ระดับน้อยที่สุด
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            {QUESTIONS.map((q, idx) => (
              <div key={idx} className={`p-8 ${idx !== QUESTIONS.length - 1 ? 'border-bottom border-gray-50' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium leading-relaxed">
                      <span className="text-primary font-bold mr-2">{idx + 1}.</span>
                      {q}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          const newRatings = [...ratings];
                          newRatings[idx] = num;
                          setRatings(newRatings);
                        }}
                        className={`w-10 h-10 rounded-xl font-bold transition-all flex items-center justify-center ${
                          ratings[idx] === num 
                            ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' 
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <h3 className="font-bold serif mb-4">ข้อเสนอแนะเพิ่มเติม</h3>
            <textarea
              className="w-full bg-gray-50 border-none rounded-2xl p-6 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all min-h-[150px]"
              placeholder="พิมพ์ข้อเสนอแนะของท่านที่นี่..."
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
            />
          </div>

          <div className="flex flex-col items-center gap-4">
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm font-bold">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-white px-12 py-4 rounded-full font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 flex items-center gap-3 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="animate-spin w-5 h-5" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              ส่งแบบประเมิน
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
