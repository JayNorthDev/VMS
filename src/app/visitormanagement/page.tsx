
'use client';

import { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LogIn,
  LogOut,
  Clock,
  UserPlus,
  Users,
  Check,
  Info,
  X,
  Search,
  BookUser,
  User,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { divisionData } from '@/lib/divisions';
import type { Division, VisitorEntry, UserProfile, IDCard } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import {
  useFirebase,
  useCollection,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useMemoFirebase,
  WithId,
  signOutUser,
} from '@/firebase';
import { collection, Timestamp, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

// --- Validation Schemas ---
const checkInSchema = z
  .object({
    identificationType: z.string().min(1, 'ID type is required.'),
    identificationNumber: z.string().min(1, 'ID number is required.'),
    fullName: z.string().min(2, 'Full name must be at least 2 characters.'),
    gender: z.string().min(1, 'Gender is required.'),
    address: z.string().min(5, 'Address must be at least 5 characters.'),
    allocatedCardId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const { identificationType, identificationNumber } = data;

    if (identificationType === 'None') {
      return; 
    }

    if (identificationType === 'NIC') {
      const nicRegex = /(^\d{9}[VX]$)|(^\d{12}$)/;
      if (!nicRegex.test(identificationNumber.toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Invalid NIC. Expected 9 digits + V/X or 12 digits.',
          path: ['identificationNumber'],
        });
      }
    }

    if (identificationType === 'Driving License') {
      const dlRegex = /^B\d{7}$/;
      if (!dlRegex.test(identificationNumber.toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid Driving License. Expected format: B1234567.',
          path: ['identificationNumber'],
        });
      }
    }

    if (identificationType === 'Passport') {
      const passportRegex = /^[A-Z]{1,2}\d{7,9}$/;
      if (!passportRegex.test(identificationNumber.toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Invalid Passport. Expected 1-2 uppercase letters and 7-9 digits.',
          path: ['identificationNumber'],
        });
      }
    }
  });

type CheckInFormValues = z.infer<typeof checkInSchema>;
type Tab = 'in' | 'out' | 'history';

// --- Main Page Component ---
export default function VisitorManagementPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || !userData || (userData.role !== 'Visitor Management' && userData.role !== 'Admin')) {
    router.replace('/');
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Redirecting...</p>
      </div>
    );
  }

  return <VisitorManagementLayout userProfile={userData} />;
}

// --- Layout Component ---
function VisitorManagementLayout({ userProfile }: { userProfile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<Tab>('in');
  const [activeSearch, setActiveSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('week');
  const { firestore } = useFirebase();

  const visitorEntriesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'visitorEntries') : null),
    [firestore]
  );
  const { data: allVisitors, isLoading: visitorsLoading } = useCollection<VisitorEntry>(visitorEntriesQuery);
  
  const availableNavItems = useMemo(() => {
    const allItems = [
        { id: 'in', permission: 'Check-In' },
        { id: 'out', permission: 'Active' },
        { id: 'history', permission: 'History' },
    ];
    if (!userProfile?.permissions) return [];
    return allItems.filter(item => userProfile.permissions.includes(item.permission));
  }, [userProfile?.permissions]);

  useEffect(() => {
      if (availableNavItems.length > 0 && !availableNavItems.some(item => item.id === activeTab)) {
        setActiveTab(availableNavItems[0].id as Tab);
      }
  }, [availableNavItems, activeTab]);


  const activeVisitors = useMemo(
    () =>
      allVisitors
        ?.filter((v) => v.status === 'IN')
        .sort((a, b) => b.checkInTime.toMillis() - a.checkInTime.toMillis()) ||
      [],
    [allVisitors]
  );

  const filteredActiveVisitors = useMemo(() => {
    if (!activeSearch) return activeVisitors;
    return activeVisitors.filter(
      (v) =>
        v.fullName.toLowerCase().includes(activeSearch.toLowerCase()) ||
        v.identificationNumber.toLowerCase().includes(activeSearch.toLowerCase()) ||
        (v.id ?? '').toLowerCase().includes(activeSearch.toLowerCase()) ||
        (v.divisionEnglishName ?? '').toLowerCase().includes(activeSearch.toLowerCase())
    );
  }, [activeVisitors, activeSearch]);

  const historyVisitors = useMemo(() => {
    if (!allVisitors) return [];

    let filtered = allVisitors
      .filter((v) => v.status === 'OUT' && v.checkOutTime)
      .sort((a, b) => b.checkOutTime!.toMillis() - a.checkOutTime!.toMillis());
    
    const now = new Date();
    if (historyFilter === 'week') {
        const startOfThisWeek = startOfWeek(now, { weekStartsOn: 1 });
        filtered = filtered.filter(v => v.checkOutTime && isAfter(v.checkOutTime!.toDate(), startOfThisWeek));
    } else if (historyFilter === 'month') {
        const startOfThisMonth = startOfMonth(now);
        filtered = filtered.filter(v => v.checkOutTime && isAfter(v.checkOutTime!.toDate(), startOfThisMonth));
    }

    return filtered;
  }, [allVisitors, historyFilter]);


  const filteredHistoryVisitors = useMemo(() => {
    if (!historySearch) return historyVisitors;
    return historyVisitors.filter(
      (v) =>
        v.fullName.toLowerCase().includes(historySearch.toLowerCase()) ||
        v.identificationNumber.toLowerCase().includes(historySearch.toLowerCase()) ||
        (v.id ?? '').toLowerCase().includes(historySearch.toLowerCase()) ||
        (v.divisionEnglishName ?? '').toLowerCase().includes(historySearch.toLowerCase())
    );
  }, [historyVisitors, historySearch]);

  const getActiveCount = (divId: string) => {
    return activeVisitors.filter((v) => v.divisionId === divId).length;
  };

  const renderContent = () => {
    const hasPermission = (tab: Tab) => availableNavItems.some(item => item.id === tab);
    
    if (!hasPermission(activeTab)) {
        return <AccessDenied />;
    }
    
    switch (activeTab) {
      case 'in':
        return <CheckInView getActiveCount={getActiveCount} allVisitors={allVisitors || []} userProfile={userProfile} />;
      case 'out':
        return <ActiveVisitorsView visitors={filteredActiveVisitors} isLoading={visitorsLoading} searchValue={activeSearch} onSearchChange={setActiveSearch} userProfile={userProfile} />;
      case 'history':
        return <HistoryView visitors={filteredHistoryVisitors} isLoading={visitorsLoading} searchValue={historySearch} onSearchChange={setHistorySearch} filter={historyFilter} onFilterChange={setHistoryFilter} />;
      default:
        return <AccessDenied />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} userProfile={userProfile} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto relative">{renderContent()}</div>
      </main>
    </div>
  );
}


// --- Navbar Component ---
const Navbar = ({
  activeTab,
  setActiveTab,
  userProfile
}: {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  userProfile: UserProfile | null;
}) => {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOutUser();
    router.replace('/');
  };

  const goToAdmin = () => {
    router.push('/admin');
  }

  const allNavItems = [
    { id: 'in', label: 'Check-In', icon: <LogIn />, permission: 'Check-In' },
    { id: 'out', label: 'Active', icon: <Users />, permission: 'Active' },
    { id: 'history', label: 'History', icon: <Clock />, permission: 'History' },
  ];

  const availableNavItems = useMemo(() => {
    if (!userProfile?.permissions) return [];
    return allNavItems.filter(item => userProfile.permissions.includes(item.permission));
  }, [userProfile?.permissions]);

  return (
    <nav className="bg-sidebar text-sidebar-foreground shadow-lg z-10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Police VMS Logo" width={40} height={40} />
          <div>
            <h1 className="text-lg font-bold leading-tight">
              Visitor Management
            </h1>
          </div>
        </div>

        <div className="flex-1 flex justify-center px-8">
            <div className="hidden md:flex items-center gap-2">
                 {availableNavItems.map(item => (
                    <NavButton
                        key={item.id}
                        id={`tab-${item.id}`}
                        label={item.label}
                        icon={item.icon}
                        isActive={activeTab === item.id}
                        onClick={() => setActiveTab(item.id as Tab)}
                    />
                ))}
                {userProfile?.role === 'Admin' && (
                  <NavButton
                    id="tab-admin"
                    label="Admin Panel"
                    icon={<BookUser />}
                    isActive={false}
                    onClick={goToAdmin}
                  />
                )}
            </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2">
                <User className="h-5 w-5" />
                <span className="text-sm font-medium">{userProfile?.name}</span>
            </div>
             <NavButton
                id="tab-signout"
                label="Sign Out"
                icon={<LogOut />}
                isActive={false}
                onClick={signOutUser}
             />
        </div>
      </div>
      
       {/* Mobile tabs */}
       <div className="md:hidden px-2 pb-2 border-t border-sidebar-border/50">
            <div className="flex items-center gap-2 overflow-x-auto">
                {availableNavItems.map(item => (
                     <NavButton
                        key={`mobile-${item.id}`}
                        id={`mobile-tab-${item.id}`}
                        label={item.label}
                        icon={item.icon}
                        isActive={activeTab === item.id}
                        onClick={() => setActiveTab(item.id as Tab)}
                      />
                ))}

                {userProfile?.role === 'Admin' && (
                  <NavButton
                    id="mobile-tab-admin"
                    label="Admin"
                    icon={<BookUser />}
                    isActive={false}
                    onClick={goToAdmin}
                  />
                )}
            </div>
        </div>
    </div>
  </nav>
  )
};

const NavButton = ({
  id,
  label,
  icon,
  isActive,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) => (
  <Button
    id={id}
    variant="ghost"
    onClick={onClick}
    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
      isActive
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
    }`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </Button>
);

const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white rounded-xl shadow-md border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800">Access Denied</h2>
        <p className="text-sm text-gray-500 mt-2">You do not have permission to view this section.</p>
    </div>
)

// --- Check-In View Component ---
const CheckInView = ({
  getActiveCount,
  allVisitors,
  userProfile,
}: {
  getActiveCount: (divId: string) => number;
  allVisitors: WithId<VisitorEntry>[];
  userProfile: UserProfile;
}) => {
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempVisitorData, setTempVisitorData] =
    useState<Omit<VisitorEntry, 'id' | 'checkInTime' | 'status'>>();

  const { toast } = useToast();
  const { firestore } = useFirebase();

  // Fetch available cards for the selected division
  const [availableCards, setAvailableCards] = useState<IDCard[]>([]);
  useEffect(() => {
    async function fetchCards() {
      if (!firestore || !selectedDivisionId) {
        setAvailableCards([]);
        return;
      }
      const cardsCol = collection(firestore, 'generated_id_cards');
      const q = query(cardsCol, where('divisionId', '==', selectedDivisionId), where('status', '==', 'available'));
      const snapshot = await getDocs(q);
      const cards = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IDCard));
      setAvailableCards(cards);
    }
    fetchCards();
  }, [firestore, selectedDivisionId]);

  const form = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: {
      identificationType: '',
      identificationNumber: '',
      fullName: '',
      gender: '',
      address: '',
      allocatedCardId: '',
    },
  });
  
  const idType = form.watch('identificationType');
  
  useEffect(() => {
    if (idType === 'None') {
      form.setValue('identificationNumber', 'N/A');
      form.clearErrors('identificationNumber');
    } else {
      if (form.getValues('identificationNumber') === 'N/A') {
        form.setValue('identificationNumber', '');
      }
    }
  }, [idType, form]);

  const handleDivisionSelect = (id: string, isDisabled: boolean) => {
    if (isDisabled) return;
    setSelectedDivisionId(id);
    form.setValue('allocatedCardId', '');
  };

  const autoFillVisitor = () => {
    const idNumber = form.getValues('identificationNumber').trim();
    if (!idNumber || idType === 'None') return;
    const existingVisitor = [...allVisitors]
      .reverse()
      .find((v) => v.identificationNumber === idNumber);
    if (existingVisitor) {
      form.setValue('fullName', existingVisitor.fullName);
      form.setValue('address', existingVisitor.address);
      form.setValue('identificationType', existingVisitor.identificationType);
      form.setValue('gender', existingVisitor.gender);
    }
  };

  function onSubmit(values: CheckInFormValues) {
    if (!selectedDivisionId) {
      toast({
        variant: 'destructive',
        title: 'Selection Missing',
        description: 'Please select a Division first!',
      });
      return;
    }
    const division = divisionData.find((d) => d.id === selectedDivisionId);
    if (!division || getActiveCount(division.id) >= division.max) {
      toast({
        variant: 'destructive',
        title: 'Division Full',
        description: 'Sorry, no cards available for this division.',
      });
      return;
    }
    setTempVisitorData({ ...values, divisionId: selectedDivisionId });
    setIsModalOpen(true);
  }

  const confirmAndSave = async () => {
    if (!tempVisitorData || !firestore) return;
    const {
      divisionId,
      fullName,
      identificationNumber,
      identificationType,
      address,
      gender,
      allocatedCardId,
    } = tempVisitorData;
    const division = divisionData.find((d) => d.id === divisionId)!;

    const newEntry: Omit<VisitorEntry, 'id'> = {
      fullName,
      identificationType,
      identificationNumber,
      address,
      gender,
      divisionId,
      checkInTime: Timestamp.now(),
      status: 'IN',
      divisionEnglishName: division.en,
      divisionSinhalaName: division.si,
      divisionBackgroundColorHex: division.color,
      divisionTextColorHex: division.text,
      allocatedCardId: allocatedCardId || null,
    };

    const visitorEntriesCollection = collection(firestore, 'visitorEntries');
    const docPromise = addDocumentNonBlocking(visitorEntriesCollection, newEntry);

    // Update Card Status if allocated
    if (allocatedCardId) {
      const cardRef = doc(firestore, 'generated_id_cards', allocatedCardId);
      updateDoc(cardRef, {
        status: 'allocated',
        currentVisitorId: 'pending', // Will update later if needed
      });
    }

    logAuditAction(
      firestore,
      userProfile.name,
      'Visitor Check-In',
      `Checked in ${newEntry.fullName} to division: ${newEntry.divisionEnglishName}. Card: ${allocatedCardId || 'None'}`
    );

    setIsModalOpen(false);
    toast({
      title: 'Visitor Checked-In Successfully!',
    });
    form.reset();
    setSelectedDivisionId(null);
  };

  const selectedDivision = divisionData.find((d) => d.id === selectedDivisionId);

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 sticky top-4">
              <div className="mb-6 border-b pb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  Visitor Details
                </h2>
                <p className="text-sm text-gray-500">Visitor Information</p>
              </div>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="identificationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Type *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select ID Type..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="NIC">NIC</SelectItem>
                          <SelectItem value="Passport">Passport</SelectItem>
                          <SelectItem value="Driving License">
                            Driving License
                          </SelectItem>
                          <SelectItem value="None">None</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="identificationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Number *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onBlur={autoFillVisitor}
                          placeholder="Enter ID to auto-fill..."
                          disabled={idType === 'None'}
                          className="uppercase"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Gender..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address *</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedDivisionId && (
                  <FormField
                    control={form.control}
                    name="allocatedCardId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" /> Allocate ID Card Number
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select available card..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableCards.length > 0 ? (
                              availableCards.map(card => (
                                <SelectItem key={card.id} value={card.cardId}>
                                  Card No: {card.cardId}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="none" disabled>No cards available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <div className="mb-6 border-b pb-4 flex justify-between items-end flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    Select Division
                  </h2>
                  <p className="text-sm text-gray-500">
                    Choose a division{' '}
                    <span className="text-red-500 font-medium ml-2">
                      * Required
                    </span>
                  </p>
                </div>
                <div className="text-sm bg-blue-50 text-blue-800 px-3 py-1 rounded-full font-medium">
                  {selectedDivision ? selectedDivision.en : 'None Selected'}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {divisionData.map((div) => {
                  const currentIn = getActiveCount(div.id);
                  const available = div.max - currentIn;
                  const isDisabled = available <= 0;
                  const isSelected = selectedDivisionId === div.id;
                  return (
                    <DivisionCard
                      key={div.id}
                      division={div}
                      available={available}
                      isDisabled={isDisabled}
                      isSelected={isSelected}
                      onClick={() => handleDivisionSelect(div.id, isDisabled)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="lg:col-span-3 mt-6 bg-white p-5 rounded-xl shadow-md border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-gray-600 text-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-full text-blue-600 flex-shrink-0">
                <Info className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-base">
                  Please review all details before proceeding.
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  Ensure all visitor information is correct before checking in.
                </p>
              </div>
            </div>
            <Button
              type="submit"
              size="lg"
              className="bg-sidebar hover:bg-sidebar/90 w-full sm:w-auto font-bold py-3 px-8 rounded-lg shadow-lg transition flex justify-center items-center gap-2 text-lg whitespace-nowrap transform hover:-translate-y-0.5"
            >
              <Check className="w-6 h-6" />
              Review & Check In
            </Button>
          </div>
        </form>
      </Form>
      {isModalOpen && tempVisitorData && (
        <VerificationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={confirmAndSave}
          visitorData={tempVisitorData}
        />
      )}
    </>
  );
};

// --- Division Card ---
const DivisionCard = ({
  division,
  available,
  isDisabled,
  isSelected,
  onClick,
}: {
  division: Division;
  available: number;
  isDisabled: boolean;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      backgroundColor: division.color,
      color: division.text,
      borderColor: division.border ? 'hsl(var(--border))' : 'transparent',
    }}
    className={`relative rounded-xl p-4 cursor-pointer border flex flex-col justify-between overflow-hidden transition-all duration-200 ease-in-out
      ${
        isDisabled
          ? 'opacity-50 cursor-not-allowed filter grayscale-80'
          : 'hover:-translate-y-0.5 hover:shadow-lg'
      }
      ${isSelected ? 'ring-4 ring-blue-500 ring-offset-2 scale-105' : ''}`}
  >
    {isSelected && (
      <div className="absolute top-2 right-2 bg-white text-blue-600 rounded-full p-1 shadow-sm">
        <Check className="w-4 h-4" />
      </div>
    )}
    <div className="mb-4 pr-6">
      <h3 className="font-bold text-[15px] leading-tight mb-1">
        {division.en}
      </h3>
      <p className="text-[13px] opacity-90">{division.si}</p>
    </div>
    <div className="mt-auto border-t border-current border-opacity-20 pt-3 flex justify-between items-center">
      <div className="text-xs font-semibold uppercase tracking-wider opacity-90">
        Available Cards
      </div>
      <div className="bg-black/10 px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">
        {isDisabled ? '0' : available} / {division.max}
      </div>
    </div>
    {isDisabled && (
      <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center backdrop-blur-[1px]">
        <div className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg text-center transform -rotate-6 border-2 border-red-400">
          <span className="block text-sm uppercase tracking-wide">No Cards</span>
          <span className="block text-xs font-normal">Unavailable</span>
        </div>
      </div>
    )}
  </div>
);

// --- Verification Modal ---
const VerificationModal = ({
  isOpen,
  onClose,
  onConfirm,
  visitorData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  visitorData: Omit<VisitorEntry, 'id' | 'checkInTime' | 'status'>;
}) => {
  const division = divisionData.find((d) => d.id === visitorData.divisionId)!;
  const modalStyle = {
    backgroundColor: division.color,
    color: division.text,
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        style={modalStyle}
        className="text-white max-w-lg w-full border-white/20"
      >
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="font-bold text-2xl tracking-tight">
                Visitor Details Preview
              </DialogTitle>
              <DialogDescription className="text-sm font-medium opacity-80 mt-1">
                Confirm visitor details
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="border border-current p-4 rounded-xl bg-black/10">
            <p className="text-xs uppercase font-bold opacity-80 mb-1 tracking-wider">
              Selected Division
            </p>
            <p className="font-bold text-xl leading-tight">{division.en}</p>
            <p className="text-sm opacity-90 font-medium mt-1">{division.si}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-current p-4 rounded-xl bg-black/10">
              <p className="text-xs uppercase font-bold opacity-80 mb-1 tracking-wider">
                Full Name
              </p>
              <p className="font-bold text-lg leading-tight">
                {visitorData.fullName}
              </p>
            </div>
            <div className="border border-current p-4 rounded-xl bg-black/10">
              <p className="text-xs uppercase font-bold opacity-80 mb-1 tracking-wider">
                Gender
              </p>
              <p className="font-bold text-lg leading-tight">
                {visitorData.gender}
              </p>
            </div>
          </div>
          <div className="border border-current p-4 rounded-xl bg-black/10">
            <p className="text-xs uppercase font-bold opacity-80 mb-1 tracking-wider">
              ID Details
            </p>
            <p className="font-bold text-lg leading-tight">
              {visitorData.identificationType} -{' '}
              {visitorData.identificationNumber}
            </p>
          </div>
          <div className="border border-current p-4 rounded-xl bg-black/10">
            <p className="text-xs uppercase font-bold opacity-80 mb-1 tracking-wider">
              Allocated Card
            </p>
            <p className="font-bold text-lg leading-tight">
              {visitorData.allocatedCardId || 'No Card Allocated'}
            </p>
          </div>
          <div className="border border-current p-4 rounded-xl bg-black/10">
            <p className="text-xs uppercase font-bold opacity-80 mb-1 tracking-wider">
              Address
            </p>
            <p className="font-bold text-lg leading-tight">
              {visitorData.address}
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-3">
          <Button
            onClick={onClose}
            className="flex-1 bg-black/20 hover:bg-black/30 border border-current font-bold"
          >
            Edit Details
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-white text-gray-900 shadow-xl hover:shadow-2xl hover:scale-105 font-bold"
          >
            <Check className="w-5 h-5 mr-2" />
            Confirm & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// --- Active Visitors View ---
const ActiveVisitorsView = ({
  visitors,
  isLoading,
  searchValue,
  onSearchChange,
  userProfile,
}: {
  visitors: WithId<VisitorEntry>[];
  isLoading: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  userProfile: UserProfile;
}) => {
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [visitorToCheckOut, setVisitorToCheckOut] = useState<{
    visitor: WithId<VisitorEntry>;
    taskStatus: 'Completed' | 'Incomplete';
  } | null>(null);

  const handleOpenCheckoutDialog = (
    visitor: WithId<VisitorEntry>,
    taskStatus: 'Completed' | 'Incomplete'
  ) => {
    setVisitorToCheckOut({ visitor, taskStatus });
    setIsCheckoutDialogOpen(true);
  };

  const handleConfirmCheckOut = () => {
    if (!firestore || !visitorToCheckOut) return;

    const { visitor, taskStatus } = visitorToCheckOut;

    const visitorRef = doc(firestore, 'visitorEntries', visitor.id);
    updateDocumentNonBlocking(visitorRef, {
      status: 'OUT',
      checkOutTime: Timestamp.now(),
      taskStatus: taskStatus,
    });
    
    // De-allocate the card if it exists
    if (visitor.allocatedCardId) {
      const cardRef = doc(firestore, 'generated_id_cards', visitor.allocatedCardId);
      updateDoc(cardRef, {
        status: 'available',
        currentVisitorId: null,
      });
    }

    logAuditAction(
      firestore,
      userProfile.name,
      'Visitor Check-Out',
      `Checked out ${visitor.fullName}. Status: ${taskStatus}. Card ${visitor.allocatedCardId || 'N/A'} returned.`
    );

    toast({
      title: 'Visitor Checked-Out Successfully!',
      description: `Status set to ${taskStatus}.`,
    });
    
    setVisitorToCheckOut(null); // Reset state after action
  };
  
  const handleCancelCheckout = () => {
    setIsCheckoutDialogOpen(false);
    setVisitorToCheckOut(null);
  };


  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <div className="mb-6 border-b pb-4 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Active Visitors</h2>
          <p className="text-sm text-gray-500">Visitors currently inside</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by name, ID..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold text-sm">
            Total Inside: {visitors.length}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        {isLoading ? (
          <p>Loading...</p>
        ) : visitors.length === 0 ? (
          <EmptyState
            icon={<Users className="w-16 h-16 mb-4" />}
            title={searchValue ? 'No Matching Visitors' : 'No Active Visitors'}
            subtitle={
              searchValue
                ? 'Try a different search term.'
                : 'There are currently no visitors inside.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="rounded-tl-lg">Visitor Info</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Division</TableHead>
                <TableHead>Card No</TableHead>
                <TableHead>Time In</TableHead>
                <TableHead className="text-center rounded-tr-lg w-[320px]">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visitors.map((v) => (
                <ActiveVisitorRow
                  key={v.id}
                  visitor={v}
                  onCheckOut={handleOpenCheckoutDialog}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

       <AlertDialog open={isCheckoutDialogOpen} onOpenChange={setIsCheckoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Visitor Check-Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to check out{' '}
              <strong>{visitorToCheckOut?.visitor.fullName}</strong>?
              <br />
              Task status will be set to{' '}
              <strong>{visitorToCheckOut?.taskStatus}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelCheckout}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCheckOut}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

const ActiveVisitorRow = ({
  visitor,
  onCheckOut,
}: {
  visitor: WithId<VisitorEntry>;
  onCheckOut: (visitor: WithId<VisitorEntry>, taskStatus: 'Completed' | 'Incomplete') => void;
}) => {
  const division = divisionData.find((d) => d.id === visitor.divisionId);
  const timeIn = visitor.checkInTime.toDate();
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
            {visitor.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="ml-4">
            <div className="text-sm font-semibold text-gray-900">
              {visitor.fullName}
            </div>
            <div className="text-xs text-gray-500">{visitor.id}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-gray-900 font-medium">
          {visitor.identificationNumber}
        </div>
        <div className="text-xs text-gray-500">
          {visitor.identificationType}
        </div>
      </TableCell>
      <TableCell>
        {division && (
          <>
            <span
              className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border shadow-sm"
              style={{
                backgroundColor: division.color,
                color: division.text,
                borderColor: division.border
                  ? 'hsl(var(--border))'
                  : 'transparent',
              }}
            >
              {division.en}
            </span>
          </>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={visitor.allocatedCardId ? "default" : "secondary"}>
          {visitor.allocatedCardId || 'None'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm text-gray-900 font-medium">
          {timeIn.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <div className="text-xs text-gray-500">
          {timeIn.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </TableCell>
      <TableCell className="text-center space-x-2 whitespace-nowrap">
        <Button
          onClick={() => onCheckOut(visitor, 'Completed')}
          size="sm"
          className="bg-sidebar hover:bg-sidebar/90"
        >
          <Check className="w-4 h-4 mr-1.5" />
          Task Completed
        </Button>
        <Button
          onClick={() => onCheckOut(visitor, 'Incomplete')}
          size="sm"
          className="bg-sidebar hover:bg-sidebar/90"
        >
          <X className="w-4 h-4 mr-1.5" />
          Task Pending / Returning
        </Button>
      </TableCell>
    </TableRow>
  );
};

// --- History View ---
const HistoryView = ({
  visitors,
  isLoading,
  searchValue,
  onSearchChange,
  filter,
  onFilterChange
}: {
  visitors: WithId<VisitorEntry>[];
  isLoading: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
}) => (
  <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
    <div className="mb-6 border-b pb-4 flex justify-between items-center flex-wrap gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Visitors History</h2>
        <p className="text-sm text-gray-500">Record of past visitors</p>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search by name, ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 w-full sm:w-64"
          />
        </div>
        <Select value={filter} onValueChange={onFilterChange}>
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by date" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
        </Select>
        <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-bold text-sm">
          Total: {visitors.length}
        </div>
      </div>
    </div>
    <div className="overflow-x-auto">
      {isLoading ? (
        <p>Loading...</p>
      ) : visitors.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-16 h-16 mb-4" />}
          title={searchValue ? 'No Matching History' : 'No History Available'}
          subtitle={
            searchValue
              ? 'Try a different search term.'
              : 'No visitor records found for the selected period.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-blue-50 hover:bg-blue-50">
              <TableHead className="rounded-tl-lg">Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Card No</TableHead>
              <TableHead>Time In</TableHead>
              <TableHead>Time Out</TableHead>
              <TableHead className="rounded-tr-lg">Task Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitors.map((v) => (
              <HistoryVisitorRow key={v.id} visitor={v} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  </div>
);

const HistoryVisitorRow = ({ visitor }: { visitor: WithId<VisitorEntry> }) => {
  const division = divisionData.find((d) => d.id === visitor.divisionId);
  const timeIn = visitor.checkInTime.toDate();
  const timeOut = visitor.checkOutTime?.toDate();
  return (
    <TableRow className="hover:bg-blue-50/50 opacity-80 hover:opacity-100">
      <TableCell>
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold border border-gray-200">
            {visitor.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="ml-4">
            <div className="text-sm font-semibold text-gray-900">
              {visitor.fullName}
            </div>
            <div className="text-xs text-gray-500">{visitor.id}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-gray-900 font-medium">
          {visitor.identificationNumber}
        </div>
        <div className="text-xs text-gray-500">
          {visitor.identificationType}
        </div>
      </TableCell>
      <TableCell>{visitor.gender}</TableCell>
      <TableCell>
        {division && (
          <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border shadow-sm bg-gray-100 text-gray-700">
            {division.en}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{visitor.allocatedCardId || 'None'}</Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm text-gray-900 font-medium">
          {timeIn.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <div className="text-xs text-gray-500">
          {timeIn.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </TableCell>
      <TableCell>
        {timeOut && (
          <>
            <div className="text-sm text-green-700 font-bold">
              {timeOut.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            <div className="text-xs text-gray-500">
              {timeOut.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </>
        )}
      </TableCell>
      <TableCell>
        {visitor.taskStatus ? (
          <Badge className={
            visitor.taskStatus === 'Completed'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-orange-600 hover:bg-orange-700 text-white'
          }>
            {visitor.taskStatus}
          </Badge>
        ) : (
          <Badge variant="secondary">N/A</Badge>
        )}
      </TableCell>
    </TableRow>
  );
};

// --- Empty State Component ---
const EmptyState = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) => (
  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
    {icon}
    <p className="text-lg font-medium">{title}</p>
    <p className="text-sm">{subtitle}</p>
  </div>
);
