'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';

import type { Customer, Product } from '@/lib/types';
import { getCustomers } from '@/lib/actions/customers';
import { getProducts } from '@/lib/actions/products';
import { createReceipt } from '@/lib/actions/receipts'; // Reverted rename createReceipt to createInvoice

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useFormField } from '@/components/ui/form'; // Import useFormField
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

export default function NewInvoicePage() { // Renamed component
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

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      console.log('Loading initial customer and product data...');
      setIsLoadingData(true);
      try {
        const [customersData, productsData] = await Promise.all([
          getCustomers(),
          getProducts(),
        ]);
        setCustomers(customersData);
        setProducts(productsData);
        console.log(`Loaded ${customersData.length} customers and ${productsData.length} products.`);
      } catch (error) {
        console.error('Failed to load initial data:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load customers or products. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingData(false);
        console.log('Finished loading initial data.');
      }
    }
    loadData();
  }, [toast]);

  // Recalculate totals when line items or GST setting change
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name?.startsWith('line_items') || name === 'include_gst') {
        console.log(`Form field changed (${name}), recalculating totals...`);
        calculateTotals(value as ReceiptFormData);
      }
    });
    // Initial calculation on load/data ready
    if (products.length > 0) {
        console.log('Performing initial total calculation...');
        calculateTotals(form.getValues());
    }
    return () => {
        console.log('Unsubscribing from form watch.');
        subscription.unsubscribe();
    };
  }, [form, products]);

  const calculateTotals = (formData: ReceiptFormData) => {
     let subtotal = 0;
     let gstAmount = 0;

     formData.line_items.forEach(item => {
         const product = products.find(p => p.id === item.product_id);
         if (product && item.quantity > 0) {
             const lineTotalExclGST = product.unit_price * item.quantity;
             subtotal += lineTotalExclGST;
             if (formData.include_gst && product.GST_applicable) {
                 gstAmount += lineTotalExclGST * 0.1;
             }
         }
     });

     if (!formData.include_gst) {
         gstAmount = 0;
     }

     const total = subtotal + gstAmount;
     const newTotals = {
         subtotal: parseFloat(subtotal.toFixed(2)),
         gst: parseFloat(gstAmount.toFixed(2)),
         total: parseFloat(total.toFixed(2)),
     };
     console.log('Calculated Totals:', newTotals);
     setCalculatedTotals(newTotals);
  };


  const onSubmit = async (data: ReceiptFormData) => {
    console.log('onSubmit triggered. Starting invoice submission...');
    setIsSubmitting(true);

    // Format date just before sending
    const submissionData = {
        ...data,
        date_of_purchase: format(data.date_of_purchase, 'yyyy-MM-dd'), // Format to YYYY-MM-DD string
    };
    console.log('Formatted submission data:', submissionData);

    try {
      console.log('Calling createReceipt server action...'); // Use correct action name
      const result = await createReceipt(submissionData); // Use createReceipt
      console.log('createReceipt action result:', result);

      if (result.success && result.receipt) {
         const receiptId = result.receipt.receipt_id;
         const shortId = receiptId.substring(0, 8);
         console.log(`Invoice ${shortId}... created successfully. PDF Path: ${result.pdfPath}`);
         toast({
           title: "Invoice Created",
           description: `Invoice ${shortId}... generated. PDF ready for download.`,
           action: result.pdfPath ? (
             <Button variant="outline" size="sm" onClick={() => window.open(`/api/download-pdf?id=${receiptId}`, '_blank')}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
             </Button>
           ) : undefined,
         });
         console.log('Resetting form...');
         form.reset({
              customer_id: '',
              date_of_purchase: new Date(),
              line_items: [{ product_id: '', quantity: 1 }],
              include_gst: false,
              force_tax_invoice: false,
         });
          console.log('Resetting calculated totals...');
          setCalculatedTotals({ subtotal: 0, gst: 0, total: 0 });
      } else {
        console.error('Error creating invoice:', result.message);
        toast({
          title: "Error Creating Invoice",
          description: result.message || "Failed to create invoice. Please check details.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Unexpected error during invoice submission:", error);
      toast({
        title: "Error",
        description: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      console.log('Invoice submission process finished.');
    }
  };

  if (isLoadingData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading data...</span></div>;
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
                    <FormLabel>Customer *</FormLabel>
                     <div className="flex items-center gap-2">
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || ''}>
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
                                  ? customer.business_name
                                  : `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
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
                    <FormLabel>Date of Purchase *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
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
              <Label className="text-lg font-medium mb-4 block">Items *</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[45%]">Product</TableHead>
                    <TableHead className="w-[15%]">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                    <TableHead className="w-[50px] text-right">Action</TableHead>
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
                                <Select onValueChange={itemField.onChange} defaultValue={itemField.value} value={itemField.value || ''}>
                                  <FormControl>
                                    <SelectTrigger className="h-9"> {/* Slightly smaller trigger */}
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
                                <FormMessage /> {/* Ensure messages show here */}
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          {/*
                            Corrected structure to avoid React.Children.only error.
                            The issue was likely related to how `FormField`, `FormControl`, and the `Input`
                            interacted, especially within the `useFieldArray` mapping.
                            Removing the explicit `FormControl` and passing field props directly to `Input`
                            within the `FormField` render prop is a common fix.
                           */}
                          <FormField
                            control={form.control}
                            name={`line_items.${index}.quantity`}
                            render={({ field: itemField }) => (
                              <FormItem>
                                  <Input
                                    type="number"
                                    min="1"
                                    className="h-9 text-right" // Slightly smaller + align
                                    {...itemField} // Spread field props directly
                                  />
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
                              className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8" // Smaller icon button
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
               {/* Display array-level errors (e.g., "At least one item required") */}
               {form.formState.errors.line_items && !form.formState.errors.line_items.root?.message && Array.isArray(form.formState.errors.line_items) && form.formState.errors.line_items.length === 0 && (
                   <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.line_items.message || 'Issue with line items.'}</p>
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
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Include GST</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Apply 10% GST to eligible products.
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                aria-label="Include GST toggle"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                     <FormField
                        control={form.control}
                        name="force_tax_invoice"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                id="force-tax-invoice-checkbox"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <Label htmlFor="force-tax-invoice-checkbox">
                                Force "Tax Invoice" Label
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Mark as Tax Invoice even if below $82.50 (requires GST to be included).
                              </p>
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

            <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting || !form.formState.isValid}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate Invoice
            </Button>
            {!form.formState.isValid && !isSubmitting && (
                 <p className="text-sm text-destructive text-center md:text-left mt-2">Please fix the errors above before submitting.</p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
