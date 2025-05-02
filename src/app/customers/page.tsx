'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams, useRouter } from 'next/navigation';


import type { Customer } from '@/lib/types';
import { getCustomers, addCustomer, updateCustomer, deleteCustomer } from '@/lib/actions/customers';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';

const customerSchema = z.object({
  id: z.string().optional(), // Present when editing
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  phone: z.string().optional(), // Add more specific phone validation if needed
  address: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
    },
  });

 useEffect(() => {
    // Check for 'new=true' query parameter to open the dialog immediately
    if (searchParams.get('new') === 'true') {
      handleAddNewCustomer();
      // Clean the URL - replace state to avoid adding to history
       router.replace('/customers', undefined);
    }
 }, [searchParams, router]); // Re-run if searchParams changes


  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
       toast({
            title: "Error",
            description: "Could not load customers. Please try again later.",
            variant: "destructive",
        });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [toast]); // Refetch isn't needed on every toast

  const handleAddNewCustomer = () => {
    setEditingCustomer(null);
    form.reset({ first_name: '', last_name: '', email: '', phone: '', address: '' }); // Reset form for new entry
    setIsDialogOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    form.reset(customer); // Populate form with customer data
    setIsDialogOpen(true);
  };

 const handleDeleteCustomer = async (id: string) => {
    try {
      const result = await deleteCustomer(id);
      if (result.success) {
        toast({
          title: "Success",
          description: "Customer deleted successfully.",
        });
        // Refresh the customer list optimistically or refetch
         setCustomers(prev => prev.filter(c => c.id !== id));
         // Or await fetchCustomers();
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to delete customer.",
          variant: "destructive",
        });
      }
    } catch (error) {
       console.error('Failed to delete customer:', error);
       toast({
          title: "Error",
          description: "An unexpected error occurred.",
          variant: "destructive",
        });
    }
  };


  const onSubmit = async (data: CustomerFormData) => {
    setIsSubmitting(true);
    try {
      let result;
      if (editingCustomer && editingCustomer.id) {
        // Update existing customer
        result = await updateCustomer(editingCustomer.id, data);
      } else {
        // Add new customer
        result = await addCustomer(data);
      }

      if (result.success && result.customer) {
        toast({
          title: "Success",
          description: `Customer ${editingCustomer ? 'updated' : 'added'} successfully.`,
        });
        setIsDialogOpen(false); // Close the dialog
        await fetchCustomers(); // Refetch the list to show changes
      } else {
         toast({
          title: "Error",
          description: result.message || `Failed to ${editingCustomer ? 'update' : 'add'} customer.`,
          variant: "destructive",
        });
      }
    } catch (error) {
       console.error(`Failed to ${editingCustomer ? 'update' : 'add'} customer:`, error);
       toast({
          title: "Error",
          description: "An unexpected error occurred.",
          variant: "destructive",
        });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-semibold">Customers</h1>
            <p className="text-muted-foreground">Manage your customer records.</p>
        </div>
        <Button onClick={handleAddNewCustomer}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Customer
        </Button>
      </div>

       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {/* DialogTrigger is omitted as we trigger manually */}
        <DialogContent className="sm:max-w-[425px] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            <DialogDescription>
              {editingCustomer ? 'Update the details for this customer.' : 'Enter the details for the new customer.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                        <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                 />
                 <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                        <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                 />
              </div>
               <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                  <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                      <Input type="email" placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                  </FormItem>
                  )}
               />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                  <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                      <Input type="tel" placeholder="0400 123 456" {...field} />
                      </FormControl>
                      <FormMessage />
                  </FormItem>
                  )}
               />
                 <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                  <FormItem>
                      <FormLabel>Address (Optional)</FormLabel>
                      <FormControl>
                      <Textarea placeholder="123 Example St, Suburb, STATE 1234" {...field} />
                      </FormControl>
                      <FormMessage />
                  </FormItem>
                  )}
               />
               <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {editingCustomer ? 'Save Changes' : 'Add Customer'}
                </Button>
               </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
           <CardDescription>View and manage your customers.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                 <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : customers.length === 0 ? (
                 <p className="text-center text-muted-foreground py-4">No customers found. Add one to get started!</p>
            ): (
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {customers.map((customer) => (
                    <TableRow key={customer.id}>
                    <TableCell>{customer.first_name} {customer.last_name}</TableCell>
                    <TableCell>{customer.email || '-'}</TableCell>
                    <TableCell>{customer.phone || '-'}</TableCell>
                    <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditCustomer(customer)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                        </Button>

                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive-foreground hover:bg-destructive">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Delete</span>
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the customer
                                    record for {customer.first_name} {customer.last_name}.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCustomer(customer.id)}>
                                    Delete
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
