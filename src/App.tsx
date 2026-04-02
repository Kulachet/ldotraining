/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { AcademicYear, Course } from './types';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  ClipboardList, 
  LogOut, 
  LogIn,
  GraduationCap,
  ShieldCheck,
  ArrowLeft,
  Lock,
  AlertCircle
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import CourseManagement from './components/CourseManagement';
import InstructorMaster from './components/InstructorMaster';
import RegistrationForm from './components/RegistrationForm';
import Registrations from './components/Registrations';
import EvaluationForm from './components/EvaluationForm';
import EvaluationDashboard from './components/EvaluationDashboard';
import AttendanceCheckIn from './components/AttendanceCheckIn';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'public' | 'admin' | 'evaluation' | 'attendance'>('public');
  const [courseIdParam, setCourseIdParam] = useState<string | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const cid = params.get('courseId');
    
    if (viewParam === 'evaluation') {
      setView('evaluation');
      setCourseIdParam(cid);
    } else if (viewParam === 'attendance') {
      setView('attendance');
      setCourseIdParam(cid);
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qYears = query(collection(db, 'academic_years'), orderBy('year', 'desc'));
    const unsubYears = onSnapshot(qYears, (snap) => {
      setAcademicYears(snap.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYear)));
      setFetchError(null);
    }, (error) => {
      console.error("Error fetching academic years:", error);
      setFetchError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ (Firestore Connection Error)");
    });

    const qCourses = query(collection(db, 'courses'));
    const unsubCourses = onSnapshot(qCourses, (snap) => {
      const fetchedCourses = snap.docs.map(d => ({ id: d.id, ...d.data() } as Course));
      // Client-side sort to ensure closest date first, and handle secondary sorting
      const sortedCourses = fetchedCourses.sort((a, b) => {
        const dateA = a.date.toMillis();
        const dateB = b.date.toMillis();
        if (dateA !== dateB) return dateA - dateB;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
      setCourses(sortedCourses);
      setFetchError(null);
    }, (error) => {
      console.error("Error fetching courses:", error);
      setFetchError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ (Firestore Connection Error)");
    });

    return () => {
      unsubYears();
      unsubCourses();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'ldo2569') {
      setIsAdminAuthenticated(true);
      setAdminError('');
      setActiveTab('dashboard');
    } else {
      setAdminError('รหัสผ่านไม่ถูกต้อง');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Admin Login Screen
  if (view === 'admin' && !isAdminAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f0f0] p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col md:flex-row min-h-[600px]"
        >
          {/* Left Side: Form */}
          <div className="flex-1 p-12 flex flex-col justify-center">
            <div className="mb-12">
              <button onClick={() => setView('public')} className="text-gray-400 hover:text-primary flex items-center gap-2 text-sm mb-8 transition-colors">
                <ArrowLeft className="w-4 h-4" /> กลับหน้าหลัก
              </button>
              
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <ShieldCheck className="text-white w-5 h-5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Welcome to</span>
              </div>
              <h1 className="text-4xl font-bold serif text-primary tracking-tight">ADMIN PORTAL</h1>
              <p className="text-gray-400 text-sm mt-4">Log in to manage courses, instructors, and registrations.</p>
            </div>
            
            <form onSubmit={handleAdminLogin} className="space-y-6 max-w-sm">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" />
                <input 
                  type="password" 
                  placeholder="Password"
                  className="w-full bg-white border border-gray-100 rounded-full p-4 pl-12 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-gray-700 transition-all shadow-sm"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {adminError && <p className="text-primary text-xs font-bold px-4">{adminError}</p>}
              <button 
                type="submit"
                className="w-full bg-primary text-white py-4 rounded-full font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 uppercase tracking-widest text-sm"
              >
                Sign In
              </button>
              
              <div className="pt-8 text-center">
                <p className="text-xs text-gray-400">
                  Don't have access? <span className="text-primary font-bold cursor-pointer hover:underline">Request Access</span>
                </p>
              </div>
            </form>
          </div>

          {/* Right Side: Branding/Image */}
          <div className="flex-1 bg-primary relative hidden md:block">
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary opacity-90"></div>
            <img 
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop" 
              alt="Background" 
              className="absolute inset-0 w-full h-full object-cover mix-blend-overlay"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-12 text-center">
              <div className="mb-6">
                <ShieldCheck className="w-20 h-20" />
              </div>
              <h2 className="text-5xl font-bold serif mb-4 tracking-tighter">INFINITY</h2>
              <div className="w-12 h-1 bg-white/30 mb-6"></div>
              <p className="text-white/80 text-sm leading-relaxed max-w-xs">
                Empowering academic excellence through seamless management and real-time data insights.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Admin View
  if (view === 'admin' && isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col md:flex-row">
        <aside className="w-full md:w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight serif">Admin Portal</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">LDO Management</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2">
            <NavItem 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
              icon={<LayoutDashboard className="w-5 h-5" />}
              label="แดชบอร์ด"
              admin
            />
            <NavItem 
              active={activeTab === 'courses'} 
              onClick={() => setActiveTab('courses')}
              icon={<BookOpen className="w-5 h-5" />}
              label="จัดการหลักสูตร"
              admin
            />
            <NavItem 
              active={activeTab === 'instructors'} 
              onClick={() => setActiveTab('instructors')}
              icon={<Users className="w-5 h-5" />}
              label="ข้อมูลอาจารย์"
              admin
            />
            <NavItem 
              active={activeTab === 'registrations'} 
              onClick={() => setActiveTab('registrations')}
              icon={<ClipboardList className="w-5 h-5" />}
              label="รายชื่อผู้สมัคร"
              admin
            />
            <NavItem 
              active={activeTab === 'evaluations'} 
              onClick={() => setActiveTab('evaluations')}
              icon={<ClipboardList className="w-5 h-5" />}
              label="ผลการประเมิน"
              admin
            />
          </nav>

          <div className="mt-auto pt-6 border-t border-gray-100">
            <button 
              onClick={() => {
                setIsAdminAuthenticated(false);
                setView('public');
                setAdminPassword('');
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ Admin
            </button>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard academicYears={academicYears} courses={courses} user={user} />}
              {activeTab === 'courses' && <CourseManagement academicYears={academicYears} courses={courses} />}
              {activeTab === 'instructors' && <InstructorMaster user={user} />}
              {activeTab === 'registrations' && <Registrations academicYears={academicYears} courses={courses} user={user} />}
              {activeTab === 'evaluations' && <EvaluationDashboard courses={courses} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    );
  }

  // Evaluation View (Public)
  if (view === 'evaluation') {
    return <EvaluationForm courseId={courseIdParam} user={user} />;
  }

  // Attendance View (Public)
  if (view === 'attendance') {
    return <AttendanceCheckIn courseId={courseIdParam} courses={courses} user={user} />;
  }

  // Public View (Registration)
  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <GraduationCap className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg serif leading-tight text-gray-900">BU Academic Training</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Learning Development Office</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView('admin')}
            className="text-gray-300 hover:text-primary p-2 rounded-full transition-colors"
            title="Admin Login"
          >
            <ShieldCheck className="w-6 h-6" />
          </button>
          
          {!user ? (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
            >
              <LogIn className="w-4 h-4" />
              เข้าสู่ระบบ
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold">{user.displayName}</p>
                <button onClick={() => signOut(auth)} className="text-[10px] text-red-600 hover:underline">ออกจากระบบ</button>
              </div>
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                alt="User" 
                className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 md:p-12">
        {fetchError && (
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">{fetchError}</p>
              <p className="text-[10px] opacity-70 mt-1">หากคุณใช้ iOS/Safari/Chrome บนมือถือ กรุณาตรวจสอบการตั้งค่า "Prevent Cross-Site Tracking" หรือแนะนำให้ทำการ Deploy แอปเพื่อใช้งานจริง</p>
            </div>
          </div>
        )}
        {!user ? (
          <div className="relative min-h-[70vh] flex flex-col items-center justify-center text-center px-4 -mt-4 md:-mt-12">
            {/* Background Image for Landing */}
            <div className="absolute inset-0 -mx-4 md:-mx-12 z-0">
              <img 
                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop" 
                alt="Background" 
                className="w-full h-full object-cover opacity-40"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#f5f5f0]/20 to-[#f5f5f0]"></div>
            </div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10 max-w-4xl"
            >
              <h2 className="text-4xl md:text-6xl font-bold mb-8 serif leading-[1.1] text-gray-900">
                ยินดีต้อนรับสู่ระบบลงทะเบียน<br className="hidden md:block" />
                การอบรมเชิงปฏิบัติการ<br />
                <span className="text-primary">สำนักพัฒนาการเรียนรู้</span>
              </h2>
              <p className="text-gray-600 mb-10 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                กรุณาเข้าสู่ระบบด้วยบัญชี Google ของมหาวิทยาลัย<br className="hidden sm:block" />
                เพื่อดำเนินการลงทะเบียนอบรม
              </p>
              <button 
                onClick={handleLogin}
                className="inline-flex items-center gap-4 bg-primary text-white py-5 px-10 rounded-2xl hover:bg-primary/90 transition-all shadow-2xl shadow-primary/30 font-bold text-xl group"
              >
                <LogIn className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                เข้าสู่ระบบด้วย Google
              </button>
            </motion.div>
          </div>
        ) : (
          <RegistrationForm academicYears={academicYears} courses={courses} user={user} />
        )}
      </main>

      <footer className="bg-white border-t border-gray-100 py-6 text-center text-[10px] text-gray-400 uppercase tracking-widest">
        &copy; 2026 Bangkok University - Learning Development Office
      </footer>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, admin }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, admin?: boolean }) {
  const activeClass = admin ? 'bg-[#1a1a1a] text-white' : 'bg-primary text-white';
  
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active 
          ? `${activeClass} shadow-lg shadow-primary/10` 
          : 'text-gray-500 hover:bg-gray-50'
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      {active && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />}
    </button>
  );
}


