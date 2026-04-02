import React, { useState, useMemo } from 'react';
import { collection, addDoc, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { AcademicYear, Course } from '../types';
import { Plus, Calendar, User, Trash2, Edit2, X, Check, Building, Search, Filter, Loader2, CheckCircle2, AlertCircle, Clock, Image as ImageIcon, Upload } from 'lucide-react';
import { formatDate } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  academicYears: AcademicYear[];
  courses: Course[];
}

export default function CourseManagement({ academicYears, courses }: Props) {
  const [isAddingYear, setIsAddingYear] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');

  const [courseForm, setCourseForm] = useState({
    title: '',
    academicYearId: '',
    date: '',
    startTime: '09:00',
    endTime: '16:00',
    speaker: '',
    description: '',
    maxParticipants: 50,
    room: '',
    published: false,
    posterUrl: ''
  });

  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPosterFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPosterPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYear) return;
    try {
      await addDoc(collection(db, 'academic_years'), {
        year: newYear,
        status: 'active'
      });
      setNewYear('');
      setIsAddingYear(false);
    } catch (err) {
      console.error(err);
    }
  };

  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCourseForm({
      title: '',
      academicYearId: '',
      date: '',
      startTime: '09:00',
      endTime: '16:00',
      speaker: '',
      description: '',
      maxParticipants: 50,
      room: '',
      published: false,
      posterUrl: ''
    });
    setPosterFile(null);
    setPosterPreview(null);
    setUploadProgress(null);
    setEditingCourseId(null);
    setIsAddingCourse(false);
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);
    try {
      let finalPosterUrl = courseForm.posterUrl;

      if (posterFile) {
        try {
          const sanitizedName = posterFile.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
          const fileRef = ref(storage, `course-posters/${Date.now()}_${sanitizedName}`);
          
          // Use uploadBytesResumable for better feedback and control
          const uploadTask = uploadBytesResumable(fileRef, posterFile);
          
          finalPosterUrl = await new Promise((resolve, reject) => {
            // Set a timeout of 15 seconds for the upload
            const timeout = setTimeout(() => {
              uploadTask.cancel();
              reject(new Error('การอัปโหลดใช้เวลานานเกินไป (Timeout) โปรดตรวจสอบว่าได้เปิดใช้งาน Firebase Storage ใน Console แล้ว หรือลองใช้ไฟล์อื่น'));
            }, 15000);

            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
              }, 
              (error) => {
                clearTimeout(timeout);
                console.error('Firebase Storage Error:', error);
                let msg = 'เกิดข้อผิดพลาดในการอัปโหลด';
                if (error.code === 'storage/unauthorized') msg = 'ไม่มีสิทธิ์ในการอัปโหลด (โปรดตรวจสอบ Storage Rules)';
                if (error.code === 'storage/canceled') msg = 'การอัปโหลดถูกยกเลิกหรือหมดเวลา';
                reject(new Error(msg + ': ' + error.message));
              }, 
              async () => {
                clearTimeout(timeout);
                try {
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve(downloadURL);
                } catch (urlErr) {
                  reject(urlErr);
                }
              }
            );
          });
        } catch (uploadErr) {
          console.error('Upload Error:', uploadErr);
          throw new Error(uploadErr instanceof Error ? uploadErr.message : 'ไม่สามารถอัปโหลดรูปภาพได้');
        }
      }

      if (!courseForm.date) {
        setError('กรุณาระบุวันที่อบรม');
        setIsSubmitting(false);
        return;
      }

      const dateObj = new Date(courseForm.date);
      if (isNaN(dateObj.getTime())) {
        setError('วันที่อบรมไม่ถูกต้อง');
        setIsSubmitting(false);
        return;
      }

      const courseData = {
        title: courseForm.title,
        academicYearId: courseForm.academicYearId,
        date: Timestamp.fromDate(dateObj),
        startTime: courseForm.startTime,
        endTime: courseForm.endTime,
        speaker: courseForm.speaker,
        description: courseForm.description,
        maxParticipants: Number(courseForm.maxParticipants),
        room: courseForm.room,
        published: courseForm.published,
        posterUrl: finalPosterUrl,
        registrationCount: 0
      };

      if (editingCourseId) {
        await updateDoc(doc(db, 'courses', editingCourseId), courseData);
      } else {
        await addDoc(collection(db, 'courses'), courseData);
      }
      
      resetForm();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Firestore Error:', err);
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (err instanceof Error ? err.message : 'โปรดตรวจสอบสิทธิ์การใช้งาน'));
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const startEdit = (course: Course) => {
    setCourseForm({
      title: course.title,
      academicYearId: course.academicYearId,
      date: course.date.toDate().toISOString().split('T')[0],
      startTime: course.startTime || '09:00',
      endTime: course.endTime || '16:00',
      speaker: course.speaker,
      description: course.description,
      maxParticipants: course.maxParticipants,
      room: course.room || '',
      published: course.published || false,
      posterUrl: course.posterUrl || ''
    });
    setPosterPreview(course.posterUrl || null);
    setEditingCourseId(course.id);
    setIsAddingCourse(true);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingYearId, setDeletingYearId] = useState<string | null>(null);

  const handleDeleteCourse = async (id: string) => {
    setError(null);
    try {
      await deleteDoc(doc(db, 'courses', id));
      setDeletingId(null);
    } catch (err) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการลบข้อมูล');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteYear = async (id: string) => {
    setError(null);
    // Check if there are courses using this year
    const coursesInYear = courses.filter(c => c.academicYearId === id);
    if (coursesInYear.length > 0) {
      setError(`ไม่สามารถลบปีการศึกษานี้ได้ เนื่องจากมีหลักสูตรผูกอยู่ (${coursesInYear.length} หลักสูตร)`);
      setDeletingYearId(null);
      setTimeout(() => setError(null), 5000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'academic_years', id));
      setDeletingYearId(null);
    } catch (err) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการลบปีการศึกษา');
      setTimeout(() => setError(null), 5000);
    }
  };

  const toggleYearStatus = async (year: AcademicYear) => {
    const newStatus = year.status === 'active' ? 'archived' : 'active';
    await updateDoc(doc(db, 'academic_years', year.id), { status: newStatus });
  };

  const togglePublishStatus = async (course: Course) => {
    try {
      await updateDoc(doc(db, 'courses', course.id), { published: !course.published });
    } catch (err) {
      console.error(err);
      setError('ไม่สามารถเปลี่ยนสถานะการแสดงผลได้');
    }
  };

  const filteredCourses = useMemo(() => {
    return courses.filter(course => {
      const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          course.speaker.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesYear = yearFilter === 'all' || course.academicYearId === yearFilter;
      return matchesSearch && matchesYear;
    });
  }, [courses, searchTerm, yearFilter]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 serif mb-2">จัดการหลักสูตรและปีการศึกษา</h1>
          <p className="text-gray-500">สร้างและแก้ไขข้อมูลหลักสูตรอบรมวิชาการ</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsAddingYear(true)}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่มปีการศึกษา
          </button>
          <button 
            onClick={() => setIsAddingCourse(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10"
          >
            <Plus className="w-4 h-4" />
            สร้างหลักสูตรใหม่
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-50 border border-green-100 text-green-700 p-4 rounded-2xl flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-bold">บันทึกหลักสูตรใหม่เรียบร้อยแล้ว!</span>
          </motion.div>
        )}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Academic Years Section */}
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">ปีการศึกษา</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <AnimatePresence>
            {isAddingYear && (
              <motion.form 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onSubmit={handleAddYear}
                className="bg-white p-4 rounded-2xl border-2 border-primary shadow-sm"
              >
                <input 
                  autoFocus
                  type="text" 
                  placeholder="เช่น 2568" 
                  className="w-full text-center font-bold text-lg mb-2 focus:outline-none"
                  value={newYear}
                  onChange={e => setNewYear(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-primary text-white p-1 rounded-lg"><Check className="w-4 h-4 mx-auto" /></button>
                  <button type="button" onClick={() => setIsAddingYear(false)} className="flex-1 bg-gray-100 text-gray-500 p-1 rounded-lg"><X className="w-4 h-4 mx-auto" /></button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
          {academicYears.map(year => (
            <div key={year.id} className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative group ${year.status === 'archived' ? 'opacity-60' : ''}`}>
              <button 
                onClick={() => setDeletingYearId(year.id)}
                className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600"
                title="ลบปีการศึกษา"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">ปีการศึกษา</p>
                <p className="text-xl font-bold serif">{year.year}</p>
                <button 
                  onClick={() => toggleYearStatus(year)}
                  className={`mt-2 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    year.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {year.status === 'active' ? 'Active' : 'Archived'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Courses Section */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">รายการหลักสูตร ({filteredCourses.length})</h3>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="ค้นหาหลักสูตร/วิทยากร..."
                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-full sm:w-64 transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select 
                className="pl-10 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none appearance-none w-full transition-all"
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
              >
                <option value="all">ทุกปีการศึกษา</option>
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>ปี {y.year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200">
              <p className="text-gray-400">ไม่พบข้อมูลหลักสูตรที่ค้นหา</p>
            </div>
          ) : (
            filteredCourses.map(course => {
              const year = academicYears.find(y => y.id === course.academicYearId);
              return (
                <div key={course.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${
                      year?.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                    }`}>
                      ปี {year?.year || '-'}
                    </span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => togglePublishStatus(course)} 
                        className={`p-2 rounded-full transition-colors ${course.published ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                        title={course.published ? 'ปิดการแสดงผล' : 'เปิดการแสดงผล'}
                      >
                        {course.published ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <button onClick={() => startEdit(course)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-primary"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeletingId(course.id)} className="p-2 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex gap-4 mb-4">
                    {course.posterUrl && (
                      <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
                        <img src={course.posterUrl} alt="Poster" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="text-lg font-bold mb-2 serif line-clamp-2">{course.title}</h4>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          course.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {course.published ? 'แสดงผลหน้าเว็บ' : 'ปิดการแสดงผล'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {formatDate(course.date)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      {course.startTime} - {course.endTime} น.
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <User className="w-4 h-4" />
                      วิทยากร: {course.speaker}
                    </div>
                    {course.room && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Building className="w-4 h-4" />
                        ห้อง: {course.room}
                      </div>
                    )}
                  </div>
                  <div className="pt-4 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400 font-bold uppercase tracking-wider">
                    <span>Max: {course.maxParticipants} ท่าน</span>
                    <button onClick={() => startEdit(course)} className="text-primary hover:underline">ดูรายละเอียด</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Add Course Modal */}
      <AnimatePresence>
        {isAddingCourse && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold serif">{editingCourseId ? 'แก้ไขหลักสูตร' : 'สร้างหลักสูตรใหม่'}</h2>
                <button onClick={resetForm} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddCourse} className="flex flex-col max-h-[85vh]">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">ชื่อหลักสูตร</label>
                      <input 
                        required
                        type="text" 
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        value={courseForm.title}
                        onChange={e => setCourseForm({...courseForm, title: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">ปีการศึกษา</label>
                      <select 
                        required
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        value={courseForm.academicYearId}
                        onChange={e => setCourseForm({...courseForm, academicYearId: e.target.value})}
                      >
                        <option value="">เลือกปีการศึกษา</option>
                        {academicYears.filter(y => y.status === 'active').map(y => (
                          <option key={y.id} value={y.id}>{y.year}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">วันที่อบรม</label>
                      <input 
                        required
                        type="date" 
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        value={courseForm.date}
                        onChange={e => setCourseForm({...courseForm, date: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">เวลาเริ่ม</label>
                        <input 
                          required
                          type="time" 
                          className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          value={courseForm.startTime}
                          onChange={e => setCourseForm({...courseForm, startTime: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">เวลาสิ้นสุด</label>
                        <input 
                          required
                          type="time" 
                          className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          value={courseForm.endTime}
                          onChange={e => setCourseForm({...courseForm, endTime: e.target.value})}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">วิทยากร</label>
                      <input 
                        required
                        type="text" 
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        value={courseForm.speaker}
                        onChange={e => setCourseForm({...courseForm, speaker: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">ห้อง / สถานที่</label>
                      <input 
                        type="text" 
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        value={courseForm.room}
                        onChange={e => setCourseForm({...courseForm, room: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">จำนวนที่รับ (ท่าน)</label>
                      <input 
                        required
                        type="number" 
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        value={courseForm.maxParticipants}
                        onChange={e => setCourseForm({...courseForm, maxParticipants: Number(e.target.value)})}
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ภาพโปสเตอร์หลักสูตร</label>
                      <div className="flex flex-col md:flex-row gap-6 items-start bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                        <div className="w-full md:w-40 aspect-[3/4] bg-white rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group shadow-sm">
                          {posterPreview ? (
                            <>
                              <img src={posterPreview} alt="Preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setPosterFile(null);
                                    setPosterPreview(null);
                                    setCourseForm({...courseForm, posterUrl: ''});
                                  }}
                                  className="bg-white/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-white/30"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-4">
                              <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-[10px] text-gray-400 font-bold uppercase">ยังไม่มีรูปภาพ</p>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-3">
                          <p className="text-xs text-gray-500">แนะนำขนาด 3:4 หรือ 4:5 (ไฟล์ JPG, PNG ไม่เกิน 5MB)</p>
                          <label className="inline-flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors shadow-sm">
                            <Upload className="w-4 h-4 text-primary" />
                            เลือกรูปภาพ
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleFileChange}
                            />
                          </label>
                          {posterFile && <p className="text-xs text-primary font-medium">เลือกไฟล์: {posterFile.name}</p>}
                          {uploadProgress !== null && uploadProgress > 0 && (
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                              <div 
                                className="bg-primary h-1.5 rounded-full transition-all duration-300" 
                                style={{ width: `${uploadProgress}%` }}
                              ></div>
                              <p className="text-[10px] text-gray-500 mt-1 font-bold">กำลังอัปโหลด: {Math.round(uploadProgress)}%</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">รายละเอียด</label>
                      <textarea 
                        className="w-full bg-gray-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none h-24 transition-all"
                        value={courseForm.description}
                        onChange={e => setCourseForm({...courseForm, description: e.target.value})}
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded text-primary focus:ring-primary"
                          checked={courseForm.published}
                          onChange={e => setCourseForm({...courseForm, published: e.target.checked})}
                        />
                        <span className="text-sm font-bold text-gray-700">เปิดการแสดงผลหน้าเว็บทันที</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                  <button type="button" onClick={resetForm} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50">ยกเลิก</button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingCourseId ? 'อัปเดตหลักสูตร' : 'บันทึกหลักสูตร'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 serif">ยืนยันการลบหลักสูตร</h3>
              <p className="text-gray-500 mb-8 text-sm">คุณต้องการลบหลักสูตรนี้ใช่หรือไม่? ข้อมูลที่ลบแล้วจะไม่สามารถกู้คืนได้</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={() => handleDeleteCourse(deletingId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-md hover:bg-red-700"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Year Confirmation Modal */}
      <AnimatePresence>
        {deletingYearId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 serif">ยืนยันการลบปีการศึกษา</h3>
              <p className="text-gray-500 mb-8 text-sm">คุณต้องการลบปีการศึกษา {academicYears.find(y => y.id === deletingYearId)?.year} ใช่หรือไม่?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingYearId(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={() => handleDeleteYear(deletingYearId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-md hover:bg-red-700"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
