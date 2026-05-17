
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, 
  Download, 
  ArrowLeft,
  Building,
  Hash,
  ShieldCheck,
  FileArchive,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFirebase } from '@/firebase';
import { collection, doc, setDoc, Timestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { divisionData } from '@/lib/divisions';
import { generateQRPayload } from '@/lib/qr-security';
import { logAuditAction } from '@/lib/audit';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import Image from 'next/image';
import JSZip from 'jszip';

/**
 * Generates a clean, English-only prefix for the division.
 * Handles station names with numeric suffixes (e.g., "District 01" -> "1").
 */
function getPrefix(name: string) {
  return name.split(/[\s,]+/)
    .map(word => {
      // Look for numbers first (handle 01, 02 etc)
      const numbers = word.match(/\d+/)?.[0]?.replace(/^0+/, '');
      if (numbers) return numbers;
      // Otherwise take the first letter of alphabetic words
      const firstLetter = word.match(/[a-zA-Z]/)?.[0];
      return firstLetter || '';
    })
    .join('')
    .toUpperCase();
}

export default function CardManagementPage() {
  const { userData, loading: authLoading } = useAuth();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  // Generation Section State
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastSequence, setLastSequence] = useState<number>(0);

  // Export Section State
  const [exportDivisionId, setExportDivisionId] = useState<string>('');
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [isCheckingExport, setIsCheckingExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Check permissions
  useEffect(() => {
    if (!authLoading) {
      if (!userData || userData.role !== 'Admin') {
        router.replace('/');
        return;
      }
      const hasPermission = userData.permissions?.some(p => 
        p === 'Access Management' || p === 'Card Management'
      );
      if (!hasPermission) {
        router.replace('/admin');
      }
    }
  }, [userData, authLoading, router]);

  // Fetch last sequence number for the generation section
  const fetchLastNum = useCallback(async (divisionId: string) => {
    if (!firestore || !divisionId) {
      setLastSequence(0);
      return;
    }
    
    try {
      const cardsCol = collection(firestore, 'generated_id_cards', divisionId, 'cards');
      const q = query(
        cardsCol, 
        orderBy('cardId', 'desc'), 
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const lastCardId = querySnapshot.docs[0].data().cardId;
        const match = lastCardId.match(/\d+$/);
        if (match) {
          setLastSequence(parseInt(match[0]));
        } else {
          setLastSequence(0);
        }
      } else {
        setLastSequence(0);
      }
    } catch (error) {
      console.error('Error fetching last sequence:', error);
      setLastSequence(0);
    }
  }, [firestore]);

  useEffect(() => {
    if (selectedDivisionId) {
      fetchLastNum(selectedDivisionId);
    } else {
      setLastSequence(0);
    }
  }, [selectedDivisionId, fetchLastNum]);

  // Check existing cards for the export section
  useEffect(() => {
    async function checkExisting() {
      if (!firestore || !exportDivisionId) {
        setExistingCount(null);
        return;
      }
      setIsCheckingExport(true);
      try {
        const cardsCol = collection(firestore, 'generated_id_cards', exportDivisionId, 'cards');
        const querySnapshot = await getDocs(cardsCol);
        setExistingCount(querySnapshot.size);
      } catch (error) {
        console.error('Error checking existing cards:', error);
        setExistingCount(0);
      } finally {
        setIsCheckingExport(false);
      }
    }
    checkExisting();
  }, [firestore, exportDivisionId]);

  if (authLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!userData) return null;

  const handleGenerateCards = async () => {
    if (!firestore || !selectedDivisionId || quantity < 1) {
      toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please select a division and quantity.' });
      return;
    }

    setIsGenerating(true);
    const division = divisionData.find(d => d.id === selectedDivisionId)!;
    const cardsCol = collection(firestore, 'generated_id_cards', selectedDivisionId, 'cards');
    
    try {
      const pdf = new jsPDF('p', 'mm', [85.6, 54]);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const prefix = getPrefix(division.en);

      for (let i = 1; i <= quantity; i++) {
        const currentNum = lastSequence + i;
        const cardIdStr = `${prefix}-${currentNum.toString().padStart(3, '0')}`;
        const qrData = generateQRPayload(cardIdStr, selectedDivisionId);

        const cardData = {
          cardId: cardIdStr,
          divisionId: selectedDivisionId,
          qrCodeData: qrData,
          status: 'available',
          currentVisitorId: null,
          currentLogId: null,
          createdAt: Timestamp.now()
        };

        await setDoc(doc(cardsCol, cardIdStr), cardData);

        if (i > 1) pdf.addPage();
        pdf.setFillColor(division.color);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        pdf.setTextColor(division.text === '#FFFFFF' ? 255 : 0);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text("VISITOR ID CARD", pageWidth / 2, 10, { align: "center" });
        pdf.setFontSize(24);
        pdf.text(currentNum.toString().padStart(2, '0'), pageWidth / 2, 35, { align: "center" });
        pdf.setFontSize(6);
        pdf.text(division.en, pageWidth / 2, 45, { align: "center" });
        const qrUrl = await QRCode.toDataURL(qrData, { margin: 1 });
        pdf.addImage(qrUrl, 'PNG', (pageWidth / 2) - 15, 50, 30, 30);
        pdf.setFontSize(4);
        pdf.text(`ID: ${cardIdStr}`, pageWidth / 2, 82, { align: "center" });
      }

      logAuditAction(firestore, userData.name, 'Batch Cards Generated', `Generated ${quantity} cards for ${division.en}. Sequence start: ${lastSequence + 1}`);
      pdf.save(`Cards_${division.en.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
      toast({ title: 'Success', description: `${quantity} cards generated and PDF downloaded.` });
      
      // Reset state and refresh counter
      setQuantity(1);
      fetchLastNum(selectedDivisionId);
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportZip = async () => {
    if (!firestore || !exportDivisionId) return;

    setIsExporting(true);
    const division = divisionData.find(d => d.id === exportDivisionId)!;
    
    try {
      const zip = new JSZip();
      const qrFolder = zip.folder("qr_images");
      let csvContent = "Card_Number,@QR_Image\n";

      const cardsCol = collection(firestore, 'generated_id_cards', exportDivisionId, 'cards');
      const querySnapshot = await getDocs(cardsCol);

      if (querySnapshot.empty) {
        toast({ variant: 'destructive', title: 'Error', description: 'No cards found for export.' });
        return;
      }

      let index = 0;
      for (const cardDoc of querySnapshot.docs) {
        const data = cardDoc.data();
        const cardId = data.cardId;
        const qrData = data.qrCodeData;
        const imageName = `${cardId}.png`;

        csvContent += `${index + 1},${imageName}\n`;
        
        const qrDataUrl = await QRCode.toDataURL(qrData, { 
          margin: 1, 
          width: 1024,
          errorCorrectionLevel: 'H' 
        });
        const base64Data = qrDataUrl.split(',')[1];
        qrFolder?.file(imageName, base64Data, { base64: true });
        
        index++;
      }

      zip.file("data.csv", csvContent);

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${division.en.replace(/\s+/g, '_')}_Print_Export.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({ title: 'Export Complete', description: `ZIP file generated for ${querySnapshot.size} cards.` });
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Export Failed', description: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  const selectedDivision = divisionData.find(d => d.id === selectedDivisionId);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <Button variant="ghost" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div className="flex items-center gap-3 mb-10">
        <ShieldCheck className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">ID Card Management</h1>
          <p className="text-muted-foreground">Configure, generate, and export secure visitor identification cards.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Section A: Batch Generation */}
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-6 w-6 text-primary" />
                Section A: Batch Generation
              </CardTitle>
              <CardDescription>
                Create NEW ID card records in the database and download a printable PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building className="h-4 w-4" /> Select Division
                  </label>
                  <Select value={selectedDivisionId} onValueChange={setSelectedDivisionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a division..." />
                    </SelectTrigger>
                    <SelectContent>
                      {divisionData.map(div => (
                        <SelectItem key={div.id} value={div.id}>{div.en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Current highest sequence: {lastSequence}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Quantity
                  </label>
                  <Input 
                    type="number" 
                    min={1} 
                    max={50} 
                    value={quantity} 
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">Cards will start from {lastSequence + 1}</p>
                </div>
              </div>

              <Button 
                className="w-full h-12 text-lg" 
                onClick={handleGenerateCards} 
                disabled={isGenerating || !selectedDivisionId}
              >
                {isGenerating ? "Processing..." : (
                  <>
                    <Download className="mr-2 h-5 w-5" /> Generate & Download PDF
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Section B: Export Printing Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
                Section B: Export Printing Data
              </CardTitle>
              <CardDescription>
                Export existing card records for external printing (ZIP with CSV and QR Images).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building className="h-4 w-4" /> Select Division for Export
                </label>
                <Select value={exportDivisionId} onValueChange={setExportDivisionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a division..." />
                  </SelectTrigger>
                  <SelectContent>
                    {divisionData.map(div => (
                      <SelectItem key={div.id} value={div.id}>{div.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {exportDivisionId && !isCheckingExport && (
                <div className={`p-4 rounded-lg flex items-start gap-3 border ${existingCount && existingCount > 0 ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                  {existingCount && existingCount > 0 ? (
                    <>
                      <FileArchive className="h-5 w-5 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm">Found {existingCount} existing cards.</p>
                        <p className="text-xs opacity-80">Ready to export for high-quality printing.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm">No cards found.</p>
                        <p className="text-xs opacity-80">Please use the generation section above to create cards for this division first.</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Button 
                variant="secondary"
                className="w-full h-12 text-lg border-2 border-primary/10" 
                onClick={handleExportZip} 
                disabled={isExporting || !existingCount || existingCount === 0}
              >
                {isExporting ? "Compressing ZIP..." : (
                  <>
                    <FileArchive className="mr-2 h-5 w-5" /> Generate & Download ZIP
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Visual Preview Sidebar */}
        <div className="space-y-6">
          <Card className="ring-2 ring-primary">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Visual Preview</CardTitle>
              <CardDescription>Mockup of the card layout.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {selectedDivision ? (
                <div 
                  className="w-full max-w-[240px] aspect-[54/85.6] rounded-xl shadow-2xl flex flex-col items-center p-6 text-center border border-white/20 transition-all duration-300"
                  style={{ 
                    backgroundColor: selectedDivision.color,
                    color: selectedDivision.text
                  }}
                >
                  <div className="flex flex-col items-center mb-4">
                    <Image src="/logo.png" alt="Logo" width={32} height={32} className="mb-1" />
                    <h3 className="font-bold text-[10px] uppercase tracking-tighter">Visitor ID Card</h3>
                  </div>
                  
                  <div className="text-7xl font-black my-4 tabular-nums">
                    {(lastSequence + 1).toString().padStart(2, '0')}
                  </div>
                  
                  <div className="mt-auto w-full">
                    <p className="text-[10px] font-bold leading-tight">{selectedDivision.en}</p>
                    <div className="mt-4 bg-white p-2 rounded-lg inline-block shadow-inner">
                      <div className="w-20 h-20 bg-gray-100 flex items-center justify-center border border-dashed border-gray-300">
                        <CreditCard className="text-gray-400 h-8 w-8" />
                      </div>
                    </div>
                    <p className="text-[7px] mt-4 opacity-70">
                      ID: {getPrefix(selectedDivision.en)}-{(lastSequence + 1).toString().padStart(3, '0')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[240px] aspect-[54/85.6] border-2 border-dashed rounded-xl flex items-center justify-center text-muted-foreground p-8 text-center text-sm bg-muted/30">
                  Select a division to see card design.
                </div>
              )}
            </CardContent>
          </Card>
          
          <div className="bg-muted/50 rounded-lg p-4 border text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-primary">Printing Notes:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>PDF format is optimized for direct A4/Letter printers.</li>
              <li>ZIP format is recommended for BarTender, Zebra, or Epson dedicated label printers.</li>
              <li>QR codes in ZIP are high-resolution (1024x1024) for optimal scanning.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
