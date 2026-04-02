import React, { useState, useEffect } from 'react';
import { collection, writeBatch, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import Papa from 'papaparse';
import { Upload, CheckCircle, AlertCircle, Loader2, Search, User, Building, Mail, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InstructorMaster as InstructorType } from '../types';
import { formatInstructorName } from '../utils';

import { User as FirebaseUser } from 'firebase/auth';

interface Props {
  user: FirebaseUser | null;
}

export default function InstructorMaster({ user }: Props) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [instructors, setInstructors] = useState<InstructorType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [encoding, setEncoding] = useState('UTF-8');

  useEffect(() => {
    const q = query(collection(db, 'instructors_master'), orderBy('name', 'asc'), limit(1000));
    const unsubscribe = onSnapshot(q, (snap) => {
      setInstructors(snap.docs.map(d => d.data() as InstructorType));
      setLoading(false);
    }, (err) => {
      console.error("Firestore error:", err);
      setError("ไม่สามารถดึงข้อมูลได้: " + err.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const filteredInstructors = instructors.filter(ins => 
    ins.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ins.instructorId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ins.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''), // Trim and remove BOM
        complete: async (results) => {
          try {
            const data = results.data as any[];
            const instructorsRef = collection(db, 'instructors_master');
            
            // Process in chunks of 450 for Firestore batches (limit is 500)
            const chunkSize = 450;
            let processedCount = 0;

            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize);
              const batch = writeBatch(db);

              for (const row of chunk) {
                // Normalize keys: strip BOM and whitespace from all keys in the row object
                const normalizedRow: any = {};
                Object.entries(row).forEach(([key, value]) => {
                  const cleanKey = key.trim().replace(/^\uFEFF/, '');
                  normalizedRow[cleanKey] = value;
                });

                const keys = Object.keys(normalizedRow);
                
                // Ultra-flexible column detection
                const idKey = keys.find(k => k.includes('รหัส') || k.toLowerCase().includes('id')) || keys[0];
                const nameKey = keys.find(k => k.includes('ชื่อ') || k.toLowerCase().includes('name')) || keys[2] || keys[1];
                const posKey = keys.find(k => k.includes('ตำแหน่ง') || k.toLowerCase().includes('pos'));
                const emailKey = keys.find(k => k.includes('อีเมล์') || k.toLowerCase().includes('email'));
                const phoneKey = keys.find(k => k.includes('โทรศัพท์') || k.includes('เบอร์') || k.toLowerCase().includes('phone'));
                const deptKey = keys.find(k => k.includes('หน่วยงาน') || k.includes('คณะ') || k.toLowerCase().includes('dept'));

                const id = (normalizedRow[idKey] || '').toString().trim();
                const name = (normalizedRow[nameKey] || '').toString().trim();
                const pos = (posKey ? normalizedRow[posKey] : '').toString().trim();
                const email = (emailKey ? normalizedRow[emailKey] : '').toString().trim();
                const phone = (phoneKey ? normalizedRow[phoneKey] : '').toString().trim();
                const dept = (deptKey ? normalizedRow[deptKey] : '').toString().trim();

                if (id && name && id !== 'รหัส' && name !== 'ชื่อ-นามสกุล') {
                  const docRef = doc(instructorsRef, id.toUpperCase());
                  batch.set(docRef, {
                    instructorId: id.toUpperCase(),
                    name: formatInstructorName(name),
                    position: pos || 'ไม่ระบุ',
                    email: email || 'ไม่ระบุ',
                    phone: phone || 'ไม่ระบุ',
                    department: dept || 'ไม่ระบุ',
                    updatedAt: new Date().toISOString()
                  });
                  processedCount++;
                }
              }
              await batch.commit();
            }

            setResult({ success: processedCount, total: data.length });
          } catch (err) {
            console.error(err);
            setError('เกิดข้อผิดพลาดในการอัปโหลดข้อมูล');
          } finally {
            setUploading(false);
          }
        },
        error: (err) => {
          setError('ไม่สามารถอ่านไฟล์ได้: ' + err.message);
          setUploading(false);
        }
      });
    };
    reader.onerror = () => {
      setError('ไม่สามารถอ่านไฟล์ได้');
      setUploading(false);
    };
    reader.readAsText(file, encoding);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 serif mb-2">ข้อมูลอาจารย์ (Master Data)</h1>
          <p className="text-gray-500">จัดการรายชื่ออาจารย์และบุคลากรในระบบ</p>
        </div>
        <button 
          onClick={() => setShowUpload(!showUpload)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            showUpload 
              ? 'bg-gray-200 text-gray-600' 
              : 'bg-primary text-white shadow-lg shadow-primary/10 hover:bg-primary/90'
          }`}
        >
          {showUpload ? 'ปิดหน้าต่างอัปโหลด' : 'อัปโหลด CSV ใหม่'}
        </button>
      </div>

      <AnimatePresence>
        {showUpload && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">เลือกไฟล์ CSV</h3>
                <p className="text-sm text-gray-500 mb-6">
                  ไฟล์ต้องมีคอลัมน์: <code className="bg-gray-100 px-1 rounded">รหัส</code>, <code className="bg-gray-100 px-1 rounded">ตำแหน่ง</code>, <code className="bg-gray-100 px-1 rounded">ชื่อ-นามสกุล</code>, <code className="bg-gray-100 px-1 rounded">อีเมล์</code>, <code className="bg-gray-100 px-1 rounded">โทรศัพท์</code>, <code className="bg-gray-100 px-1 rounded">หน่วยงาน</code>
                </p>

                <div className="mb-6 flex justify-center items-center gap-4">
                  <span className="text-sm font-bold text-gray-600">รหัสภาษาไฟล์ (Encoding):</span>
                  <select 
                    value={encoding}
                    onChange={(e) => setEncoding(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    <option value="UTF-8">UTF-8 (มาตรฐาน)</option>
                    <option value="windows-874">Windows-874 (ภาษาไทย Excel)</option>
                  </select>
                </div>
                
                <label className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-medium cursor-pointer hover:bg-primary/90 transition-all shadow-lg shadow-primary/10">
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      กำลังอัปโหลด...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      เลือกไฟล์จากเครื่อง
                    </>
                  )}
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>

              {result && (
                <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3">
                  <CheckCircle className="text-green-600 w-6 h-6" />
                  <div>
                    <p className="text-green-800 font-bold">อัปโหลดสำเร็จ!</p>
                    <p className="text-green-700 text-sm">นำเข้าข้อมูลอาจารย์ {result.success} จาก {result.total} รายการ</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
                  <AlertCircle className="text-red-600 w-6 h-6" />
                  <p className="text-red-800 font-bold">{error}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="ค้นหาด้วยชื่อ, รหัส หรือหน่วยงาน..."
              className="w-full bg-gray-50 border-none rounded-xl p-3 pl-12 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-xs text-gray-400 font-bold uppercase tracking-widest">
            แสดง {filteredInstructors.length} รายการล่าสุด
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">รหัส</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ชื่อ-นามสกุล / ตำแหน่ง</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">หน่วยงาน</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">การติดต่อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              ) : filteredInstructors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                    ไม่พบข้อมูลอาจารย์
                  </td>
                </tr>
              ) : (
                filteredInstructors.map((ins) => (
                  <tr key={ins.instructorId} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">
                        {ins.instructorId}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{formatInstructorName(ins.name)}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{ins.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Building className="w-3.5 h-3.5" />
                        <span className="text-xs">{ins.department}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Mail className="w-3 h-3" />
                          <span className="text-[10px]">{ins.email}</span>
                        </div>
                        {ins.phone && (
                          <div className="flex items-center gap-2 text-gray-500">
                            <Phone className="w-3 h-3" />
                            <span className="text-[10px]">{ins.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
