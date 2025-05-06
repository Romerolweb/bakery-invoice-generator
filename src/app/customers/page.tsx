// src/app/customers/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams, useRouter } from "next/navigation";
// Assuming types are defined in '@/lib/types'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  Loader2,
  PlusCircle,
  Edit,
  Trash2,
  Building,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Define ABN regex for client-side validation consistency
const abnRegex = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;

// Base schema for common fields
const baseCustomerSchema = z.object({
  id: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
});

// Schema for individual customer
const individualCustomerSchema = baseCustomerSchema.extend({
  customer_type: z.literal("individual"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().optional(),
  business_name: z.string().optional().nullable().or(z.literal("")), // Ensure it can be empty/null
  abn: z.string().optional().nullable().or(z.literal("")), // Ensure it can be empty/null
});

// Schema for business customer
const businessCustomerSchema = baseCustomerSchema.extend({
  customer_type: z.literal("business"),
  first_name: z.string().optional(), // Contact person
  last_name: z.string().optional(), // Contact person
  business_name: z.string().min(1, "Business name is required"),
  abn: z
    .string()
    .optional()
    .refine((val) => !val || abnRegex.test(val), {
      message: "Invalid ABN format (e.g., 11 111 111 111)",
    })
    .or(z.literal("")), // Optional but validated if present
});

// Discriminated union schema
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
    defaultValues: defaultValues,
  });

  const customerType = form.watch("customer_type");

  useEffect(() => {
    // Check for 'new=true' query parameter to open the dialog immediately
    if (searchParams.get("new") === "true") {
      handleAddNewCustomer();
      // Clean the URL - replace state to avoid adding to history
      router.replace("/customers", undefined);
    }
  }, [searchParams, router]); // Re-run if searchParams changes

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
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
  }, []); // Fetch only once on mount

  const handleAddNewCustomer = () => {
    setEditingCustomer(null);
    form.reset(defaultValues); // Reset form for new entry
    setIsDialogOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    // Make sure all potential fields are included, setting to '' if undefined/null
    form.reset({
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
        setCustomers((prev) => prev.filter((c) => c.id !== id));
        // Or await fetchCustomers();
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to delete customer.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to delete customer:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: CustomerFormData) => {
    setIsSubmitting(true);
    form.clearErrors(); // Clear previous errors

    // Clear business fields if type is individual before sending
    const submissionData =
      data.customer_type === "individual"
        ? { ...data, business_name: undefined, abn: undefined }
        : data;

    try {
      let result;
      if (editingCustomer && editingCustomer.id) {
        // Update existing customer
        result = await updateCustomer(editingCustomer.id, submissionData);
      } else {
        // Add new customer
        result = await addCustomer(submissionData);
      }

      if (result.success && result.customer) {
        toast({
          title: "Success",
          description: `Customer ${editingCustomer ? "updated" : "added"} successfully.`,
        });
        setIsDialogOpen(false); // Close the dialog
        await fetchCustomers(); // Refetch the list to show changes
      } else {
        // Display validation errors from the server action if available
        if (result.errors) {
          Object.entries(result.errors).forEach(([field, messages]) => {
            // Check if messages is an array and has items before accessing [0]
            if (Array.isArray(messages) && messages.length > 0) {
              form.setError(field as keyof CustomerFormData, {
                type: "server",
                message: messages[0],
              });
            } else if (typeof messages === "string") {
              // Handle cases where errors might be a single string
              form.setError(field as keyof CustomerFormData, {
                type: "server",
                message: messages,
              });
            }
          });
        }
        toast({
          title: "Error",
          description:
            result.message ||
            `Failed to ${editingCustomer ? "update" : "add"} customer. Check the highlighted fields.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(
        `Failed to ${editingCustomer ? "update" : "add"} customer:`,
        error,
      );
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
        <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
          {" "}
          {/* Adjusted width */}
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
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex space-x-4"
                      >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem
                              value="individual"
                              id="individual"
                            />
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
                            <Building className="h-4 w-4" /> Business
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
                        <FormLabel>Business Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Doe Enterprises Pty Ltd"
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
                    name="abn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ABN (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 11 111 111 111"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-sm text-muted-foreground mt-2 -mb-2">
                    Contact Person (Optional)
                  </p>
                </>
              )}

              <div
                className={cn(
                  "grid gap-4",
                  customerType === "individual"
                    ? "md:grid-cols-2"
                    : "md:grid-cols-2",
                )}
              >
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {customerType === "individual"
                          ? "First Name *"
                          : "Contact First Name"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            customerType === "individual"
                              ? "John"
                              : "Contact First Name"
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
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {customerType === "individual"
                          ? "Last Name (Optional)"
                          : "Contact Last Name (Optional)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            customerType === "individual"
                              ? "Doe"
                              : "Contact Last Name"
                          }
                          {...field}
                          value={field.value ?? ""}
                        />
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
                  <TableHead>Name / Business</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>ABN</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      {customer.customer_type === "business" ? (
                        <>
                          <div>{customer.business_name}</div>
                          {(customer.first_name || customer.last_name) && (
                            <div className="text-xs text-muted-foreground">
                              Contact: {customer.first_name}{" "}
                              {customer.last_name}
                            </div>
                          )}
                        </>
                      ) : (
                        `${customer.first_name} ${customer.last_name || ""}`
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {customer.customer_type}
                    </TableCell>
                    <TableCell>{customer.email || "-"}</TableCell>
                    <TableCell>{customer.phone || "-"}</TableCell>
                    <TableCell>{customer.abn || "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditCustomer(customer)}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Are you absolutely sure?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will
                              permanently delete the customer record for{" "}
                              {customer.customer_type === "business"
                                ? customer.business_name
                                : `${customer.first_name} ${customer.last_name || ""}`}
                              .
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCustomer(customer.id)}
                            >
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
