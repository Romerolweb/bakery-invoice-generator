"use client";

import { useState, useEffect, Suspense, useCallback } from "react"; // Added useCallback
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams, useRouter } from "next/navigation";
import type { Customer } from "@/lib/types";
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Loader2, User, Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Validation Schema ---
const abnRegex = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;
const baseCustomerSchema = z.object({
  id: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
});
const individualCustomerSchema = baseCustomerSchema.extend({
  customer_type: z.literal("individual"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().optional(),
  business_name: z.string().optional().nullable().or(z.literal("")),
  abn: z.string().optional().nullable().or(z.literal("")),
});
const businessCustomerSchema = baseCustomerSchema.extend({
  customer_type: z.literal("business"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  business_name: z.string().min(1, "Business name is required"),
  abn: z
    .string()
    .optional()
    .refine((val) => !val || abnRegex.test(val), {
      message: "Invalid ABN format (e.g., 11 111 111 111)",
    })
    .or(z.literal("")),
});
const customerSchema = z.discriminatedUnion("customer_type", [
  individualCustomerSchema,
  businessCustomerSchema,
]);
type CustomerFormData = z.infer<typeof customerSchema>;
const defaultValues: CustomerFormData = {
  customer_type: "individual",
  first_name: "",
  last_name: "",
  business_name: "",
  abn: "",
  email: "",
  phone: "",
  address: "",
};

// --- OOP: Service for Customer Data ---
class CustomerService {
  async fetchAll(): Promise<Customer[]> {
    return await getCustomers();
  }
  async add(data: CustomerFormData) {
    return await addCustomer(data);
  }
  async update(id: string, data: CustomerFormData) {
    return await updateCustomer(id, data);
  }
  async remove(id: string) {
    return await deleteCustomer(id);
  }
}

// --- OOP: Form Manager ---
class CustomerFormManager {
  private form: ReturnType<typeof useForm<CustomerFormData>>;
  constructor(form: ReturnType<typeof useForm<CustomerFormData>>) {
    this.form = form;
  }
  resetForNew() {
    this.form.reset(defaultValues);
  }
  resetForEdit(customer: Customer) {
    this.form.reset({
      id: customer.id,
      customer_type: customer.customer_type,
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      business_name: customer.business_name || "",
      abn: customer.abn || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
    });
  }
  clearErrors() {
    this.form.clearErrors();
  }
  setServerErrors(errors: Record<string, string[] | string>) {
    Object.entries(errors).forEach(([field, messages]) => {
      if (Array.isArray(messages) && messages.length > 0) {
        this.form.setError(field as keyof CustomerFormData, {
          type: "server",
          message: messages[0],
        });
      } else if (typeof messages === "string") {
        this.form.setError(field as keyof CustomerFormData, {
          type: "server",
          message: messages,
        });
      }
    });
  }
}

// --- Main Page Content ---
function CustomersPageContent() {
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
    defaultValues,
  });
  
  // Memoize service and manager instances if they don't depend on component state/props
  // For now, assuming they are stable or their instability is managed.
  const formManager = new CustomerFormManager(form);
  const customerService = new CustomerService();
  const customerType = form.watch("customer_type");

  // --- Handlers (Memoized with useCallback) ---

  const handleAddNewCustomer = useCallback(() => {
    setEditingCustomer(null);
    formManager.resetForNew();
    setIsDialogOpen(true);
  }, [formManager]);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await customerService.fetchAll();
      setCustomers(data);
    } catch (error) {
      console.error("Client: Failed to fetch customers:", error instanceof Error ? error : new Error(String(error)));
      toast({
        title: "Error",
        description: "Could not load customers. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [customerService, toast]);

  // --- Effects ---
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      handleAddNewCustomer();
      router.replace("/customers", undefined);
    }
  }, [searchParams, router, handleAddNewCustomer]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);


  const handleEditCustomer = useCallback((customer: Customer) => {
    setEditingCustomer(customer);
    formManager.resetForEdit(customer);
    setIsDialogOpen(true);
  }, [formManager]);

  const handleDeleteCustomer = useCallback(async (id: string) => {
    // Basic client-side ID validation
    if (!id) {
      console.error("Client: handleDeleteCustomer called with invalid ID.");
      toast({ title: "Error", description: "Invalid customer ID.", variant: "destructive" });
      return;
    }
    try {
      const result = await customerService.remove(id);
      if (result.success) {
        toast({ title: "Success", description: "Customer deleted successfully." });
        setCustomers((prev) => prev.filter((c) => c.id !== id));
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to delete customer.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(`Client: Failed to delete customer ${id}:`, error instanceof Error ? error : new Error(String(error)));
      toast({
        title: "Error",
        description: "An unexpected error occurred while deleting.",
        variant: "destructive",
      });
    }
  }, [customerService, toast]);

  const onSubmit = useCallback(async (data: CustomerFormData) => {
    setIsSubmitting(true);
    formManager.clearErrors();
    const submissionData =
      data.customer_type === "individual"
        ? { ...data, business_name: undefined, abn: undefined }
        : data;
    try {
      let result;
      const actionType = editingCustomer ? "update" : "add";

      if (editingCustomer && editingCustomer.id) {
        result = await customerService.update(editingCustomer.id, submissionData);
      } else {
        result = await customerService.add(submissionData);
      }

      if (result.success && result.customer) {
        toast({
          title: "Success",
          description: `Customer ${actionType}d successfully.`,
        });
        setIsDialogOpen(false);
        await fetchCustomers(); // Refetch to show changes
      } else {
        if (result.errors) formManager.setServerErrors(result.errors);
        toast({
          title: "Error",
          description:
            result.message ||
            `Failed to ${actionType} customer. Check the highlighted fields.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(`Client: Failed to ${editingCustomer ? "update" : "add"} customer:`, error instanceof Error ? error : new Error(String(error)));
      toast({
        title: "Error",
        description: "An unexpected error occurred during submission.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [customerService, editingCustomer, fetchCustomers, formManager, toast]);

  // --- Render ---
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
        <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? "Update the details for this customer."
                : "Enter the details for the new customer."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 py-4"
            >
              {/* Customer Type Selection */}
              <FormField
                control={form.control}
                name="customer_type"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Customer Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value === "individual") {
                            form.setValue("business_name", "");
                            form.setValue("abn", "");
                          }
                        }}
                        defaultValue={field.value}
                        className="flex space-x-4"
                      >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="individual" id="individual" />
                          </FormControl>
                          <FormLabel
                            htmlFor="individual"
                            className="font-normal flex items-center gap-1"
                          >
                            <User className="h-4 w-4" /> Individual
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="business" id="business" />
                          </FormControl>
                          <FormLabel
                            htmlFor="business"
                            className="font-normal flex items-center gap-1"
                          >
                            <User className="h-4 w-4" /> Business
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Conditional Fields */}
              {customerType === "business" && (
                <>
                  <FormField
                    control={form.control}
                    name="business_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe Enterprises Pty Ltd" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="abn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ABN (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="11 111 111 111" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <div
                className={cn(
                  "grid gap-4",
                  "md:grid-cols-2"
                )}
              >
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{customerType === "individual" ? "First Name" : "Contact First Name (Optional)"}</FormLabel>
                      <FormControl>
                        <Input placeholder={customerType === "individual" ? "John" : "Alex (Contact)"} {...field} value={field.value ?? ""} />
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
                      <FormLabel>{customerType === "individual" ? "Last Name (Optional)" : "Contact Last Name (Optional)"}</FormLabel>
                      <FormControl>
                        <Input placeholder={customerType === "individual" ? "Doe" : "Smith (Contact)"} {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Common Fields */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder={
                          customerType === "individual"
                            ? "john.doe@example.com"
                            : "accounts@doe-enterprises.com"
                        }
                        {...field}
                        value={field.value ?? ""}
                      />
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
                      <Input
                        type="tel"
                        placeholder={
                          customerType === "individual"
                            ? "0400 123 456"
                            : "Business Phone"
                        }
                        {...field}
                        value={field.value ?? ""}
                      />
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
                      <Textarea
                        placeholder={
                          customerType === "individual"
                            ? "123 Example St, Suburb, STATE 1234"
                            : "Business Address"
                        }
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {editingCustomer ? "Save Changes" : "Add Customer"}
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
            <p className="text-center text-muted-foreground py-4">
              No customers found. Add one to get started!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      {customer.customer_type === "individual"
                        ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
                        : customer.business_name}
                    </TableCell>
                    <TableCell>{customer.customer_type}</TableCell>
                    <TableCell>{customer.email || "-"}</TableCell>
                    <TableCell>{customer.phone || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditCustomer(customer)}
                        className="mr-2"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCustomer(customer.id!)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-4 text-lg">Loading customers...</p></div>}>
      <CustomersPageContent />
    </Suspense>
  );
}
