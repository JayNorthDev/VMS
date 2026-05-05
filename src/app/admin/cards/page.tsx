
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, 
  Download, 
  PlusCircle, 
  ArrowLeft,
  Building,
  Hash,
  CheckCircle2
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

  if (authLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!userData || userData.role !== 'Admin') {
    router.replace('/');
    return null;
  }

  const handleGenerateCards = async () => {
    if (!firestore || !selectedDivisionId || quantity < 1) {
      toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please select a division and quantity.' });
      return;
    }

    setIsGenerating(true);
    const division = divisionData.find(d => d.id === selectedDivisionId)!;
    const cardsCol = collection(firestore, 'generated_id_cards');
    
    try {
      // Find the last card number for this division to continue sequence
      const q = query(cardsCol, where('divisionId', '==', selectedDivisionId), orderBy('cardId', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      let lastNum = 0;
      if (!querySnapshot.empty) {
        const lastCardId = querySnapshot.docs[0].data().cardId;
        const match = lastCardId.match(/\d+$/);
        if (match) lastNum = parseInt(match[0]);
      }

      const generatedCards = [];
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 1; i <= quantity; i++) {
        const currentNum = lastNum + i;
        const cardIdStr = `${division.en.split(' ').map(w => w[0]).join('').toUpperCase()}-${currentNum.toString().padStart(3, '0')}`;
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

        // Save to Firestore
        await setDoc(doc(cardsCol, cardIdStr), cardData);
        generatedCards.push(cardData);

        // Add to PDF
        if (i > 1) pdf.addPage();
        
        // Background color
        pdf.setFillColor(division.color);
        pdf.rect(10, 10, pageWidth - 20, pageHeight - 20, 'F');

        // Text color
        pdf.setTextColor(division.text === '#FFFFFF' ? 255 : 0);
        
        // Header
        pdf.setFontSize(22);
        pdf.setFont("helvetica", "bold");
        pdf.text("VISITOR ID CARD", pageWidth / 2, 30, { align: "center" });
        
        pdf.setFontSize(14);
        pdf.text("POLICE STATION BADULLA", pageWidth / 2, 40, { align: "center" });

        // Card ID
        pdf.setFontSize(60);
        pdf.text(currentNum.toString().padStart(2, '0'), pageWidth / 2, 80, { align: "center" });

        // Division Names
        pdf.setFontSize(16);
        pdf.text(division.en, pageWidth / 2, 110, { align: "center" });
        pdf.setFontSize(14);
        pdf.text(division.si, pageWidth / 2, 120, { align: "center" });

        // QR Code
        const qrUrl = await QRCode.toDataURL(qrData);
        pdf.addImage(qrUrl, 'PNG', (pageWidth / 2) - 40, 140, 80, 80);

        // Card Ref
        pdf.setFontSize(10);
        pdf.text(`Card ID: ${cardIdStr}`, pageWidth / 2, 230, { align: "center" });
      }

      logAuditAction(firestore, userData.name, 'Batch Cards Generated', `Generated ${quantity} cards for ${division.en}`);
      
      pdf.save(`Cards_${division.en}_${new Date().getTime()}.pdf`);
      toast({ title: 'Success', description: `${quantity} cards generated and PDF downloaded.` });
      
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Button variant="ghost" className="mb-6" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Generate ID Cards
            </CardTitle>
            <CardDescription>
              Create a batch of ID cards for a specific division. Each card will have a unique QR code.
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
                <Hash className="h-4 w-4" /> Quantity
              </label>
              <Input 
                type="number" 
                min={1} 
                max={50} 
                value={quantity} 
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Max 50 cards per batch for performance.</p>
            </div>

            <Button 
              className="w-full" 
              size="lg" 
              onClick={handleGenerateCards} 
              disabled={isGenerating || !selectedDivisionId}
            >
              {isGenerating ? (
                "Generating..."
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" /> Generate & Download PDF
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-lg">Card Design Preview</CardTitle>
            <CardDescription>Visual representation of the printed card.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-6">
            {selectedDivisionId ? (
              <div 
                className="w-full max-w-[280px] aspect-[1/1.4] rounded-2xl shadow-xl flex flex-col items-center p-6 text-center transition-colors"
                style={{ 
                  backgroundColor: divisionData.find(d => d.id === selectedDivisionId)?.color || '#eee',
                  color: divisionData.find(d => d.id === selectedDivisionId)?.text || '#000'
                }}
              >
                <h3 className="font-bold text-xl mb-1">VISITOR ID CARD</h3>
                <p className="text-[10px] opacity-80 uppercase tracking-widest mb-6">Police Station Badulla</p>
                
                <div className="text-6xl font-black my-4">60</div>
                
                <p className="text-sm font-bold mb-1">{divisionData.find(d => d.id === selectedDivisionId)?.en}</p>
                <p className="text-xs opacity-90">{divisionData.find(d => d.id === selectedDivisionId)?.si}</p>
                
                <div className="mt-auto bg-white p-2 rounded-lg">
                  <div className="w-24 h-24 bg-gray-200 flex items-center justify-center">
                    <CreditCard className="text-gray-400" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-[280px] aspect-[1/1.4] border-2 border-dashed rounded-2xl flex items-center justify-center text-muted-foreground">
                Select a division to preview
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
