
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, 
  Download, 
  ArrowLeft,
  Building,
  Hash,
  Eye,
  ShieldCheck
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

export default function CardGenerationPage() {
  const { userData, loading: authLoading } = useAuth();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [lastSequence, setLastSequence] = useState<number>(0);

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

  // Fetch last sequence number for the selected division
  useEffect(() => {
    async function fetchLastNum() {
      if (!firestore || !selectedDivisionId) return;
      
      const cardsCol = collection(firestore, 'generated_id_cards');
      const q = query(
        cardsCol, 
        where('divisionId', '==', selectedDivisionId), 
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
    }
    fetchLastNum();
  }, [firestore, selectedDivisionId]);

  if (authLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!userData) return null;

  const handleGenerateCards = async () => {
    if (!firestore || !selectedDivisionId || quantity < 1) {
      toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please select a division and quantity.' });
      return;
    }

    setIsGenerating(true);
    const division = divisionData.find(d => d.id === selectedDivisionId)!;
    const cardsCol = collection(firestore, 'generated_id_cards');
    
    try {
      const pdf = new jsPDF('p', 'mm', [85.6, 54]); // Credit card size in mm
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 1; i <= quantity; i++) {
        const currentNum = lastSequence + i;
        const prefix = division.en.split(' ').map(w => w[0]).join('').toUpperCase();
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

        // Save to Firestore (Non-overwriting check usually handled by unique ID, but we use cardId as ID)
        await setDoc(doc(cardsCol, cardIdStr), cardData);

        // Add to PDF
        if (i > 1) pdf.addPage();
        
        // Background color
        pdf.setFillColor(division.color);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');

        // Header
        pdf.setTextColor(division.text === '#FFFFFF' ? 255 : 0);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text("VISITOR ID CARD", pageWidth / 2, 8, { align: "center" });
        
        pdf.setFontSize(5);
        pdf.text("POLICE STATION BADULLA", pageWidth / 2, 12, { align: "center" });

        // Card ID Number
        pdf.setFontSize(24);
        pdf.text(currentNum.toString().padStart(2, '0'), pageWidth / 2, 28, { align: "center" });

        // Division Names
        pdf.setFontSize(6);
        pdf.text(division.en, pageWidth / 2, 38, { align: "center" });
        pdf.setFontSize(5);
        pdf.text(division.si, pageWidth / 2, 42, { align: "center" });

        // QR Code
        const qrUrl = await QRCode.toDataURL(qrData, { margin: 1 });
        pdf.addImage(qrUrl, 'PNG', (pageWidth / 2) - 15, 48, 30, 30);

        // Footer Card Ref
        pdf.setFontSize(4);
        pdf.text(`Card ID: ${cardIdStr}`, pageWidth / 2, 82, { align: "center" });
      }

      logAuditAction(firestore, userData.name, 'Batch Cards Generated', `Generated ${quantity} cards for ${division.en}. Sequence start: ${lastSequence + 1}`);
      
      pdf.save(`Cards_${division.en.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
      toast({ title: 'Success', description: `${quantity} cards generated starting from ${lastSequence + 1}.` });
      
      // Refresh sequence
      setLastSequence(lastSequence + quantity);
      
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedDivision = divisionData.find(d => d.id === selectedDivisionId);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Button variant="ghost" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div className="flex items-center gap-3 mb-8">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Card Management</h1>
          <p className="text-muted-foreground">Securely generate and manage visitor identification cards.</p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Batch Configuration
            </CardTitle>
            <CardDescription>
              New cards will continue the sequence from <strong>{lastSequence + 1}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Hash className="h-4 w-4" /> Quantity to Generate
              </label>
              <Input 
                type="number" 
                min={1} 
                max={50} 
                value={quantity} 
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Highest current: {lastSequence}</p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                disabled={!selectedDivisionId}
              >
                <Eye className="mr-2 h-4 w-4" /> {isPreviewMode ? "Hide Preview" : "Preview Design"}
              </Button>
              
              <Button 
                className="w-full" 
                size="lg" 
                onClick={handleGenerateCards} 
                disabled={isGenerating || !selectedDivisionId}
              >
                {isGenerating ? (
                  "Processing Batch..."
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" /> Generate & Download PDF
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={isPreviewMode ? "ring-2 ring-primary transition-all" : "bg-muted/30"}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Visual Preview
            </CardTitle>
            <CardDescription>
              {selectedDivisionId ? `Mockup for ${selectedDivision?.en}` : "Select a division to see card design."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-6">
            {selectedDivision ? (
              <div 
                className="w-full max-w-[260px] aspect-[54/85.6] rounded-xl shadow-2xl flex flex-col items-center p-6 text-center border border-white/20"
                style={{ 
                  backgroundColor: selectedDivision.color,
                  color: selectedDivision.text
                }}
              >
                <div className="flex flex-col items-center mb-4">
                  <Image src="/logo.png" alt="Logo" width={32} height={32} className="mb-1" />
                  <h3 className="font-bold text-xs uppercase tracking-tighter">Visitor ID Card</h3>
                  <p className="text-[8px] opacity-80 uppercase leading-none">Police Station Badulla</p>
                </div>
                
                <div className="text-7xl font-black my-4 tabular-nums">
                  {(lastSequence + 1).toString().padStart(2, '0')}
                </div>
                
                <div className="mt-auto w-full">
                  <p className="text-[10px] font-bold leading-tight">{selectedDivision.en}</p>
                  <p className="text-[9px] opacity-90 leading-tight">{selectedDivision.si}</p>
                  
                  <div className="mt-4 bg-white p-2 rounded-lg inline-block shadow-inner">
                    <div className="w-20 h-20 bg-gray-100 flex items-center justify-center border border-dashed border-gray-300">
                      <CreditCard className="text-gray-400 h-8 w-8" />
                    </div>
                  </div>
                  
                  <p className="text-[7px] mt-4 opacity-70">
                    ID: {selectedDivision.en.split(' ').map(w => w[0]).join('').toUpperCase()}-{(lastSequence + 1).toString().padStart(3, '0')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-[260px] aspect-[54/85.6] border-2 border-dashed rounded-xl flex items-center justify-center text-muted-foreground p-8 text-center text-sm">
                Live card preview will appear here once a division is selected.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
