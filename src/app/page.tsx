'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';

import type { Customer, Product } from '@/lib/types';
import { getCustomers } from '@/lib/actions/customers';
import { getProducts } from '@/lib/actions/products';
import { createReceipt } from '@/lib/actions/receipts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'; // Added FormDescription
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator'; // Use ShadCN Separator
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Download } from 'lucide-react'; // Added Download icon
import { format } from 'date-fns'; // Keep parseISO if reading ISO strings

const lineItemSchema = z.object({
  product_id: z.string().min(1, 'Product selection is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
});

const receiptFormSchema = z.object({
  customer_id: z.string().min(1, 'Customer selection is required'),
  date_of_purchase: z.date({ required_error: "Date of purchase is required." }),
  line_items: z.array(lineItemSchema).min(1, 'At least one item is required'),
  include_gst: z.boolean().default(false),
  force_tax_invoice: z.boolean().default(false),
});

type ReceiptFormData = z.infer<typeof receiptFormSchema>;

export default function NewReceiptPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calculatedTotals, setCalculatedTotals] = useState<{ subtotal: number; gst: number; total: number }>({ subtotal: 0, gst: 0, total: 0 });

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: {
      customer_id: '',
      date_of_purchase: new Date(),
      line_items: [{ product_id: '', quantity: 1 }],
      include_gst: false,
      force_tax_invoice: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'line_items',
  });

  // Fetch initial data (customers, products)
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [customersData, productsData] = await Promise.all([
          getCustomers(),
          getProducts(),
        ]);
        setCustomers(customersData);
        setProducts(productsData);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load customers or products. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingData(false);
      }
    }
    loadData();
  }, [toast]);

  // --- Calculation Logic ---
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name?.startsWith('line_items') || name === 'include_gst') {
        calculateTotals(value as ReceiptFormData);
      }
    });
    // Initial calculation on load
    calculateTotals(form.getValues());
    return () => subscription.unsubscribe();
  }, [form, products]); // Re-run if form or products change


  const calculateTotals = (formData: ReceiptFormData) => {
     let subtotal = 0;
     let gstAmount = 0;

     formData.line_items.forEach(item => {
         const product = products.find(p => p.id === item.product_id);
         if (product && item.quantity > 0) {
             const lineTotalExclGST = product.unit_price * item.quantity;
             subtotal += lineTotalExclGST;
             if (formData.include_gst && product.GST_applicable) {
                 // Assume unit_price is exclusive GST
                 gstAmount += lineTotalExclGST * 0.1;
             }
         }
     });

     if (!formData.include_gst) {
         gstAmount = 0; // Ensure GST is zero if not included
     }

     const total = subtotal + gstAmount;
     setCalculatedTotals({
         subtotal: parseFloat(subtotal.toFixed(2)),
         gst: parseFloat(gstAmount.toFixed(2)),
         total: parseFloat(total.toFixed(2)),
     });
  };


  const onSubmit = async (data: ReceiptFormData) => {
    setIsSubmitting(true);

    // Format date just before sending to the server action
    const submissionData = {
        ...data,
        date_of_purchase: format(data.date_of_purchase, 'yyyy-MM-dd'),
    };

    try {
      const result = await createReceipt(submissionData);
      if (result.success && result.receipt) {
         const receiptId = result.receipt.receipt_id;
        toast({
          title: "Invoice Created",
          description: `Invoice ${receiptId.substring(0, 8)}... generated successfully. PDF is being prepared for download.`, // Updated text
          action: result.pdfPath ? (
             // Trigger download via API route
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/download-pdf?id=${receiptId}`, '_blank')}>
                 <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          ) : undefined,
        });
        form.reset({ // Reset form with default structure but keep date
             customer_id: '',
             date_of_purchase: new Date(), // Reset date to today, or keep data.date_of_purchase if desired
             line_items: [{ product_id: '', quantity: 1 }],
             include_gst: false,
             force_tax_invoice: false,
        });
         setCalculatedTotals({ subtotal: 0, gst: 0, total: 0 }); // Reset totals
      } else {
        toast({
          title: "Error Creating Invoice", // Updated text
          description: result.message || "Failed to create invoice. Please check the details.", // Updated text
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while creating the invoice.", // Updated text
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Invoice</CardTitle>
        <CardDescription>Fill in the details below to generate a new invoice.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Customer and Date Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                     <div className="flex items-center gap-2">
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.length === 0 && <SelectItem value="no-customers" disabled>No customers found</SelectItem>}
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.customer_type === 'business'
                                  ? customer.business_name // Show business name
                                  : `${customer.first_name || ''} ${customer.last_name || ''}` // Show individual name
                                }
                                {customer.email ? ` (${customer.email})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/customers?new=true"> <PlusCircle className="mr-1 h-4 w-4"/> Add</Link>
                        </Button>
                     </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date_of_purchase"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date of Purchase</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={`w-full justify-start text-left font-normal ${!field.value && "text-muted-foreground"}`}
                          >
                             <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Line Items Section */}
            <div>
              <Label className="text-lg font-medium mb-4 block">Items</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50%]">Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Line Total</TableHead>
                    <TableHead className="w-[50px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const selectedProductId = form.watch(`line_items.${index}.product_id`);
                    const selectedProduct = products.find(p => p.id === selectedProductId);
                    const quantity = form.watch(`line_items.${index}.quantity`) || 0;
                    const unitPrice = selectedProduct?.unit_price ?? 0;
                    const lineTotal = unitPrice * quantity;

                    return (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`line_items.${index}.product_id`}
                            render={({ field: itemField }) => (
                              <FormItem>
                                {/* <FormLabel className="sr-only">Product</FormLabel> */}
                                <Select onValueChange={itemField.onChange} defaultValue={itemField.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select product" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                     {products.length === 0 && <SelectItem value="no-products" disabled>No products defined</SelectItem>}
                                    {products.map((product) => (
                                      <SelectItem key={product.id} value={product.id}>
                                        {product.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`line_items.${index}.quantity`}
                            render={({ field: itemField }) => (
                              <FormItem>
                                {/* <FormLabel className="sr-only">Quantity</FormLabel> */}
                                <FormControl>
                                  <Input type="number" min="1" {...itemField} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                         <TableCell className="text-right">
                            ${unitPrice.toFixed(2)}
                         </TableCell>
                         <TableCell className="text-right">
                            ${lineTotal.toFixed(2)}
                         </TableCell>
                        <TableCell className="text-right">
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Remove Item</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
               <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => append({ product_id: '', quantity: 1 })}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Item
              </Button>
               {form.formState.errors.line_items && !form.formState.errors.line_items.root?.message && (
                   <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.line_items.message}</p>
               )}
               {form.formState.errors.line_items?.root?.message && (
                    <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.line_items.root.message}</p>
               )}
            </div>


            {/* GST and Totals Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                 <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="include_gst"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Include GST</FormLabel>
                              <FormDescription>
                                Apply 10% GST where applicable to products.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                     <FormField
                        control={form.control}
                        name="force_tax_invoice"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                Force "Tax Invoice" Label
                              </FormLabel>
                              <FormDescription>
                                Mark this as a Tax Invoice even if below the $82.50 threshold.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                        />
                 </div>
                 <Card className="bg-secondary/50">
                     <CardHeader className="pb-2">
                         <CardTitle className="text-lg">Summary</CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-2">
                          <div className="flex justify-between">
                            <span>Subtotal (excl. GST):</span>
                            <span className="font-medium">${calculatedTotals.subtotal.toFixed(2)}</span>
                          </div>
                           <div className="flex justify-between">
                            <span>GST (10%):</span>
                            <span className="font-medium">${calculatedTotals.gst.toFixed(2)}</span>
                          </div>
                           <Separator className="my-2"/>
                           <div className="flex justify-between font-semibold text-lg">
                            <span>Total (incl. GST):</span>
                            <span>${calculatedTotals.total.toFixed(2)}</span>
                          </div>
                     </CardContent>
                 </Card>
            </div>

            <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate Invoice
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
