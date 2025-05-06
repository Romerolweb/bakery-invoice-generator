"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";

import type { Customer, Product, Receipt } from "@/lib/types";
import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { createReceipt } from "@/lib/actions/receipts"; // Use createReceipt

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  PlusCircle,
  Trash2,
  CalendarIcon,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
// Removed logger import: import { logger } from '@/lib/services/logging';

const lineItemSchema = z.object({
  product_id: z.string().min(1, "Product selection is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

const receiptFormSchema = z.object({
  customer_id: z.string().min(1, "Customer selection is required"),
  date_of_purchase: z.date({ required_error: "Date of purchase is required." }),
  line_items: z.array(lineItemSchema).min(1, "At least one item is required"),
  include_gst: z.boolean().default(false),
  force_tax_invoice: z.boolean().default(false),
});

type ReceiptFormData = z.infer<typeof receiptFormSchema>;

const CLIENT_LOG_PREFIX = "NewInvoicePage";

export default function NewInvoicePage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calculatedTotals, setCalculatedTotals] = useState<{
    subtotal: number;
    gst: number;
    total: number;
  }>({ subtotal: 0, gst: 0, total: 0 });

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: {
      customer_id: "",
      date_of_purchase: new Date(),
      line_items: [{ product_id: "", quantity: 1 }],
      include_gst: false,
      force_tax_invoice: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "line_items",
  });

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      console.log(
        CLIENT_LOG_PREFIX,
        "Loading initial customer and product data...",
      ); // Use console.log
      setIsLoadingData(true);
      try {
        const [customersData, productsData] = await Promise.all([
          getCustomers(),
          getProducts(),
        ]);
        setCustomers(customersData);
        setProducts(productsData);
        console.log(
          CLIENT_LOG_PREFIX,
          `Loaded ${customersData.length} customers and ${productsData.length} products.`,
        ); // Use console.log
      } catch (error) {
        console.error(CLIENT_LOG_PREFIX, "Failed to load initial data", error); // Use console.error
        toast({
          title: "Error Loading Data",
          description:
            "Could not load customers or products. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingData(false);
        console.log(CLIENT_LOG_PREFIX, "Finished loading initial data."); // Use console.log
      }
    }
    loadData();
  }, [toast]); // Dependency array includes toast

  // Recalculate totals when line items or GST setting change
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name?.startsWith("line_items") || name === "include_gst") {
        console.debug(
          CLIENT_LOG_PREFIX,
          `Form field changed (${name}), recalculating totals...`,
        ); // Use console.debug
        calculateTotals(value as ReceiptFormData);
      }
    });
    // Trigger initial calculation once products are loaded
    if (products.length > 0 && !isLoadingData) {
      console.debug(
        CLIENT_LOG_PREFIX,
        "Performing initial total calculation...",
      ); // Use console.debug
      calculateTotals(form.getValues());
    }
    return () => {
      console.debug(CLIENT_LOG_PREFIX, "Unsubscribing from form watch."); // Use console.debug
      subscription.unsubscribe();
    };
    // Dependencies: form for watch, products for initial calc trigger, isLoadingData to wait
  }, [form, products, isLoadingData]);

  const calculateTotals = (formData: ReceiptFormData) => {
    let subtotal = 0;
    let gstAmount = 0;

    formData.line_items.forEach((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (product && item.quantity > 0) {
        const lineTotalExclGST = product.unit_price * item.quantity;
        subtotal += lineTotalExclGST;
        // Only apply GST if 'include_gst' is checked AND the product is GST applicable
        if (formData.include_gst && product.GST_applicable) {
          gstAmount += lineTotalExclGST * 0.1;
        }
      }
    });

    // Ensure GST is zero if the main flag is off
    if (!formData.include_gst) {
      gstAmount = 0;
    }

    // Ensure calculations are rounded to 2 decimal places
    const total = subtotal + gstAmount;
    const newTotals = {
      subtotal: parseFloat(subtotal.toFixed(2)),
      gst: parseFloat(gstAmount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
    };
    console.debug(CLIENT_LOG_PREFIX, "Calculated Totals:", newTotals); // Use console.debug
    setCalculatedTotals(newTotals);
  };

  const onSubmit = async (data: ReceiptFormData) => {
    console.info(
      CLIENT_LOG_PREFIX,
      "onSubmit triggered. Starting invoice submission...",
    ); // Use console.info
    setIsSubmitting(true);

    // Format date correctly before sending to server action
    const submissionData = {
      ...data,
      date_of_purchase: format(data.date_of_purchase, "yyyy-MM-dd"),
    };
    console.info(CLIENT_LOG_PREFIX, "Formatted submission data:", {
      customer_id: submissionData.customer_id,
      date: submissionData.date_of_purchase,
      itemCount: submissionData.line_items.length,
    }); // Use console.info

    try {
      console.info(CLIENT_LOG_PREFIX, "Calling createReceipt server action..."); // Use console.info
      const result = await createReceipt(submissionData);
      console.info(CLIENT_LOG_PREFIX, "createReceipt action result:", result); // Use console.info

      if (result.success && result.receipt) {
        const receiptId = result.receipt.receipt_id;
        const shortId = receiptId.substring(0, 8);

        // Handle PDF status based on the result
        if (result.pdfGenerated && result.pdfPath) {
          console.info(
            CLIENT_LOG_PREFIX,
            `Invoice ${shortId}... created AND PDF generated. Server Path (internal): ${result.pdfPath}`,
          ); // Use console.info
          toast({
            title: "Invoice Created & PDF Ready",
            description: `Invoice ${shortId}... generated successfully.`,
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/api/download-pdf?id=${receiptId}`, "_blank")
                }
              >
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            ),
            duration: 9000, // Longer duration for action button
          });
        } else if (result.pdfError) {
          console.warn(
            CLIENT_LOG_PREFIX,
            `Invoice ${shortId}... created, but PDF generation FAILED: ${result.pdfError}`,
          ); // Use console.warn
          toast({
            title: "Invoice Created (PDF Failed)",
            description: `Invoice ${shortId}... saved, but PDF generation failed: ${result.pdfError}`,
            variant: "destructive",
            duration: 15000, // Keep visible longer for error details
          });
        } else {
          // This case should be less common now with the refactored action result
          console.warn(
            CLIENT_LOG_PREFIX,
            `Invoice ${shortId}... created, but PDF status is unknown or generation was not attempted due to prior error.`,
          ); // Use console.warn
          toast({
            title: "Invoice Created (PDF Status Uncertain)",
            description: `Invoice ${shortId}... saved, but the PDF status is unclear. Check history later.`,
            variant: "default", // Use default variant
            duration: 7000,
          });
        }

        // Reset form only on successful data save
        console.info(CLIENT_LOG_PREFIX, "Resetting form and totals..."); // Use console.info
        form.reset({
          customer_id: "",
          date_of_purchase: new Date(),
          line_items: [{ product_id: "", quantity: 1 }],
          include_gst: false,
          force_tax_invoice: false,
        });
        setCalculatedTotals({ subtotal: 0, gst: 0, total: 0 });
      } else {
        // Handle overall failure (likely data saving or validation failed)
        console.error(
          CLIENT_LOG_PREFIX,
          "Error creating invoice (data saving/validation):",
          result.message,
        ); // Use console.error
        toast({
          title: "Error Creating Invoice",
          description:
            result.message || "Failed to create invoice. Please check details.",
          variant: "destructive",
          duration: 10000,
        });
      }
    } catch (error) {
      // Catch unexpected errors during the action call itself
      console.error(
        CLIENT_LOG_PREFIX,
        "Unexpected error during invoice submission process:",
        error,
      ); // Use console.error
      toast({
        title: "Error",
        description: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setIsSubmitting(false);
      console.info(CLIENT_LOG_PREFIX, "Invoice submission process finished."); // Use console.info
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />{" "}
        <span className="ml-2">Loading data...</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Invoice</CardTitle>
        <CardDescription>
          Fill in the details below to generate a new invoice.
        </CardDescription>
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.length === 0 && (
                            <SelectItem value="no-customers" disabled>
                              No customers found
                            </SelectItem>
                          )}
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.customer_type === "business"
                                ? customer.business_name
                                : `${customer.first_name || ""} ${customer.last_name || ""}`.trim()}
                              {customer.email ? ` (${customer.email})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/customers?new=true">
                          {" "}
                          <PlusCircle className="mr-1 h-4 w-4" /> Add
                        </Link>
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
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
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
                    <TableHead className="w-[15%] text-right">
                      Quantity
                    </TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                    <TableHead className="w-[50px] text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const selectedProductId = form.watch(
                      `line_items.${index}.product_id`,
                    );
                    const selectedProduct = products.find(
                      (p) => p.id === selectedProductId,
                    );
                    const quantity =
                      form.watch(`line_items.${index}.quantity`) || 0;
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
                                <Select
                                  onValueChange={itemField.onChange}
                                  defaultValue={itemField.value}
                                  value={itemField.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select product" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {products.length === 0 && (
                                      <SelectItem value="no-products" disabled>
                                        No products defined
                                      </SelectItem>
                                    )}
                                    {products.map((product) => (
                                      <SelectItem
                                        key={product.id}
                                        value={product.id}
                                      >
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
                        <TableCell className="text-right">
                          <FormField
                            control={form.control}
                            name={`line_items.${index}.quantity`}
                            render={({ field: itemField }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    className="h-9 w-20 text-right inline-block"
                                    {...itemField}
                                  />
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
                              className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8"
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
                onClick={() => append({ product_id: "", quantity: 1 })}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Item
              </Button>
              {/* Display root error for line_items array if present */}
              {form.formState.errors.line_items?.root?.message && (
                <p className="text-sm font-medium text-destructive mt-2">
                  {form.formState.errors.line_items.root.message}
                </p>
              )}
              {/* Display general array message if root is not set but array itself has an error message */}
              {form.formState.errors.line_items &&
                !form.formState.errors.line_items.root &&
                typeof form.formState.errors.line_items === "object" &&
                "message" in form.formState.errors.line_items && (
                  <p className="text-sm font-medium text-destructive mt-2">
                    {form.formState.errors.line_items.message}
                  </p>
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
                        <FormDescription>
                          Apply 10% GST to eligible products.
                        </FormDescription>
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
                          disabled={!form.watch("include_gst")} // Disable if GST is not included
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <Label
                          htmlFor="force-tax-invoice-checkbox"
                          className={cn(
                            !form.watch("include_gst") &&
                              "text-muted-foreground/50",
                          )}
                        >
                          Force "Tax Invoice" Label
                        </Label>
                        <FormDescription
                          className={cn(
                            !form.watch("include_gst") &&
                              "text-muted-foreground/50",
                          )}
                        >
                          Mark as Tax Invoice even if below $82.50 (requires GST
                          to be included).
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
                    <span className="font-medium">
                      ${calculatedTotals.subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST (10%):</span>
                    <span className="font-medium">
                      ${calculatedTotals.gst.toFixed(2)}
                    </span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total Amount:</span>
                    <span>${calculatedTotals.total.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={isSubmitting || !form.formState.isValid}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Generate Invoice
            </Button>
            {/* Show general form error message if submitted and invalid */}
            {form.formState.isSubmitted &&
              !form.formState.isValid &&
              !isSubmitting && (
                <p className="text-sm text-destructive text-center md:text-left mt-2">
                  Please fix the errors above before submitting.
                </p>
              )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
