/**
 * NDA Signing Page — shown to share-token users who haven't signed an NDA yet.
 * Features: NDA text, name/email fields, signature canvas, drag/drop upload, download PDF.
 * Styled to match the PPEI dark industrial theme.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Upload, Download, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

const NDA_TEXT = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into by and between PPEI / Kory Willis ("Disclosing Party") and the undersigned individual ("Receiving Party").

1. CONFIDENTIAL INFORMATION
The Receiving Party acknowledges that all information, data, software, tools, analyses, diagnostics, calibration data, tuning strategies, proprietary algorithms, trade secrets, and intellectual property accessed through the VOP (Vehicle Operating Platform) system, including but not limited to:
  • Engine calibration files and tuning parameters
  • Diagnostic algorithms and fault detection logic
  • Proprietary data analysis methodologies
  • Software architecture and implementation details
  • Business strategies and product roadmaps
  • Customer data and vehicle information

are considered Confidential Information of the Disclosing Party.

2. OBLIGATIONS
The Receiving Party agrees to:
  a) Hold all Confidential Information in strict confidence
  b) Not disclose, publish, or otherwise reveal any Confidential Information to any third party
  c) Not copy, reproduce, screenshot, screen record, or otherwise capture any Confidential Information
  d) Not reverse engineer, decompile, or attempt to derive source code or algorithms
  e) Use the Confidential Information solely for the purpose for which access was granted
  f) Immediately notify the Disclosing Party of any unauthorized disclosure or use

3. MONITORING & ENFORCEMENT
The Receiving Party acknowledges that:
  a) All access is logged, monitored, and auditable
  b) Screen capture and recording detection systems are active
  c) Violation of this Agreement may result in immediate termination of access
  d) The Disclosing Party reserves the right to pursue legal remedies for any breach

4. TERM
This Agreement shall remain in effect for a period of 180 days from the date of signing, and the obligations of confidentiality shall survive termination.

5. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of Texas.

By signing below, the Receiving Party acknowledges that they have read, understood, and agree to be bound by the terms of this Agreement.`;

interface NdaSigningPageProps {
  tokenId: number;
  onNdaSigned: () => void;
}

export default function NdaSigningPage({ tokenId, onNdaSigned }: NdaSigningPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [ndaStatus, setNdaStatus] = useState<'none' | 'pending' | 'verified' | 'rejected' | 'expired'>('none');
  const [dragOver, setDragOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const submitNda = trpc.auth.submitNda.useMutation();

  // Check existing NDA status when email is entered
  const ndaCheck = trpc.auth.checkNdaStatus.useQuery(
    { email: email.toLowerCase().trim() },
    { enabled: email.includes('@') && email.includes('.') }
  );

  useEffect(() => {
    if (ndaCheck.data) {
      if (!ndaCheck.data.hasNda) {
        setNdaStatus(ndaCheck.data.status === 'expired' ? 'expired' : 'none');
      } else if (ndaCheck.data.status === 'verified') {
        setNdaStatus('verified');
        // Auto-proceed if NDA is already verified
        setTimeout(() => onNdaSigned(), 1500);
      } else if (ndaCheck.data.status === 'pending') {
        setNdaStatus('pending');
      } else if (ndaCheck.data.status === 'rejected') {
        setNdaStatus('rejected');
      }
    }
  }, [ndaCheck.data, onNdaSigned]);

  // Canvas drawing handlers
  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    lastPosRef.current = getCanvasPos(e);
  }, [getCanvasPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !lastPosRef.current) return;

    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPosRef.current = pos;
    setHasSigned(true);
  }, [isDrawing, getCanvasPos]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
    lastPosRef.current = null;
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSigned(false);
  }, []);

  // Get signature as data URL
  const getSignatureDataUrl = useCallback((): string => {
    const canvas = canvasRef.current;
    return canvas?.toDataURL('image/png') ?? '';
  }, []);

  // Download NDA as text file
  const downloadNda = useCallback(() => {
    const content = NDA_TEXT + `\n\nSigned by: ${name}\nEmail: ${email}\nDate: ${new Date().toISOString()}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VOP_NDA_${name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, email]);

  // Drag/drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) {
      setUploadedFile(file);
    } else {
      setError('Please upload a PDF or image file');
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  }, []);

  // Submit NDA
  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return; }
    if (!hasSigned && !uploadedFile) { setError('Please sign the NDA or upload a signed copy'); return; }

    setSubmitting(true);
    setError('');

    try {
      const signatureUrl = hasSigned ? getSignatureDataUrl() : 'uploaded-document';

      const result = await submitNda.mutateAsync({
        tokenId,
        signerName: name.trim(),
        signerEmail: email.toLowerCase().trim(),
        signatureImageUrl: signatureUrl,
      });

      if (result.success) {
        setNdaStatus('pending');
      } else {
        setError(result.message || 'Failed to submit NDA');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit NDA');
    } finally {
      setSubmitting(false);
    }
  }, [name, email, hasSigned, uploadedFile, tokenId, submitNda, getSignatureDataUrl]);

  // Status screens
  if (ndaStatus === 'verified') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
            NDA VERIFIED
          </h2>
          <p className="text-gray-400" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Access granted. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  if (ndaStatus === 'pending') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <Clock className="w-16 h-16 text-yellow-500 mx-auto" />
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
            NDA PENDING VERIFICATION
          </h2>
          <p className="text-gray-400" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Your NDA has been submitted and is awaiting verification by VOP administration.
            You will be able to access the page once your NDA is verified.
          </p>
          <p className="text-gray-500 text-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Try refreshing this page after you've been notified of verification.
          </p>
          <Button
            variant="outline"
            onClick={downloadNda}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Your Signed NDA
          </Button>
        </div>
      </div>
    );
  }

  if (ndaStatus === 'rejected') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
            NDA REJECTED
          </h2>
          <p className="text-gray-400" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Your NDA submission was not accepted.
            {ndaCheck.data?.rejectionReason && (
              <span className="block mt-2 text-red-400">Reason: {ndaCheck.data.rejectionReason}</span>
            )}
          </p>
          <Button
            onClick={() => { setNdaStatus('none'); clearSignature(); }}
            className="bg-red-700 hover:bg-red-600 text-white"
          >
            Submit New NDA
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-900/30 border border-red-800/50 rounded text-red-400 text-xs uppercase tracking-widest"
               style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            <FileText className="w-3.5 h-3.5" />
            Required Before Access
          </div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.08em' }}>
            NON-DISCLOSURE AGREEMENT
          </h1>
          <p className="text-gray-400 text-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            You must read and sign this NDA before accessing confidential VOP content.
          </p>
        </div>

        {/* NDA Text */}
        <div className="bg-[#111] border border-gray-800 rounded-sm p-4 max-h-64 overflow-y-auto">
          <pre className="text-gray-300 text-xs whitespace-pre-wrap leading-relaxed"
               style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            {NDA_TEXT}
          </pre>
        </div>

        {/* Name & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1"
                   style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              Full Legal Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="bg-[#111] border-gray-700 text-white placeholder:text-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1"
                   style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              Email Address *
            </label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              type="email"
              className="bg-[#111] border-gray-700 text-white placeholder:text-gray-600"
            />
          </div>
        </div>

        {/* Signature Canvas */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider"
                   style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              Digital Signature *
            </label>
            {hasSigned && (
              <button onClick={clearSignature} className="text-xs text-red-400 hover:text-red-300 underline">
                Clear
              </button>
            )}
          </div>
          <div className="bg-[#0d0d0d] border border-gray-700 rounded-sm relative">
            <canvas
              ref={canvasRef}
              width={600}
              height={150}
              className="w-full cursor-crosshair touch-none"
              style={{ height: '120px' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasSigned && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-gray-600 text-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  Sign here with your mouse or finger
                </span>
              </div>
            )}
          </div>
        </div>

        {/* OR Upload */}
        <div className="relative flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-500 uppercase tracking-wider"
                style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            Or upload signed NDA
          </span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <div
          className={`border-2 border-dashed rounded-sm p-6 text-center transition-colors ${
            dragOver ? 'border-red-500 bg-red-900/10' : 'border-gray-700 bg-[#0d0d0d]'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uploadedFile ? (
            <div className="flex items-center justify-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                {uploadedFile.name}
              </span>
              <button
                onClick={() => setUploadedFile(null)}
                className="text-xs text-gray-400 hover:text-red-400 ml-2 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                Drag & drop a signed NDA (PDF or image)
              </p>
              <label className="inline-block mt-2 text-xs text-red-400 hover:text-red-300 cursor-pointer underline">
                Browse files
                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileInput} />
              </label>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-sm px-3 py-2 text-red-400 text-sm"
               style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSubmit}
            disabled={submitting || (!hasSigned && !uploadedFile) || !name.trim() || !email.includes('@')}
            className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold uppercase tracking-wider disabled:opacity-40"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.1em' }}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
            ) : (
              'I Agree & Sign NDA'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={downloadNda}
            disabled={!name.trim()}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>

        <p className="text-center text-xs text-gray-600" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          This NDA is valid for 180 days from the date of signing.
          All access is monitored and logged.
        </p>
      </div>
    </div>
  );
}
