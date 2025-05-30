// src/app/settings/page.tsx
"use client"; // This component needs client-side interaction for the form
// Importing necessary types
import type { SellerProfile } from "@/lib/types";
import { getSellerProfile, updateSellerProfile } from "@/lib/actions/seller";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Use Textarea for address
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
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// Basic ABN/ACN format check (can be more robust)
const abnRegex = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/; // Optional spaces
const acnRegex = /^\d{3}\s?\d{3}\s?\d{3}$/; // Optional spaces
// Defining the Zod schema for seller profile form validation
const sellerProfileSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  business_address: z.string().min(1, "Business address is required"),
  ABN_or_ACN: z
    .string()
    .min(1, "ABN or ACN is required")
    .refine(
      (val) => abnRegex.test(val) || acnRegex.test(val),
      "Invalid ABN or ACN format (e.g., 11 111 111 111 or 111 111 111)",
    )
    .transform(
      // Optional: Remove spaces for consistent storage if needed
      (val) => val.replace(/\s/g, ""),
    ),
  contact_email: z.string().email("Invalid email address"),
  phone: z.string().optional(), // Optional phone number
  logo_url: z.string().url("Invalid URL format").optional().or(z.literal("")), // Optional URL
});

export default function SettingsPage() {
  // Hook for displaying toasts
  const { toast } = useToast();
  // State variables for loading and submission status
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SellerProfile>({
    resolver: zodResolver(sellerProfileSchema),
    defaultValues: {
      name: "",
      business_address: "",
      ABN_or_ACN: "",
      contact_email: "",
      phone: "",
      logo_url: "",
    },
  });

  // Effect hook to fetch seller profile data when the component mounts
  useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      // Fetch data from the server action
      try {
        const profile = await getSellerProfile();
        // Ensure all fields are reset, including optional ones
        if (profile) {
          form.reset({
            name: profile.name || "",
            business_address: profile.business_address || "",
            ABN_or_ACN: profile.ABN_or_ACN || "",
            contact_email: profile.contact_email || "",
            phone: profile.phone || "",
            logo_url: profile.logo_url || "",
          });
        } else {
          // Handle case where profile is null
          form.reset({
            name: "",
            business_address: "",
            ABN_or_ACN: "",
            contact_email: "",
            phone: "",
            logo_url: "",
          });
        }
      } catch (error) {
        console.error("Failed to fetch seller profile:", error);
        toast({
          title: "Error",
          description: "Could not load seller profile.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, [form, toast]);

  // Handler for form submission
  const onSubmit = async (data: SellerProfile) => {
    setIsSubmitting(true);
    try {
      // Call the server action to update the profile
      const result = await updateSellerProfile(data);
      if (result.success) {
        toast({
          title: "Success",
          description: "Seller profile updated successfully.",
        });
        if (result.profile) {
          form.reset(result.profile); // Update form with potentially cleaned/saved data
        }
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to update profile.",
          variant: "destructive",
        });
      }
      // Catch any unexpected errors during the process
    } catch (error) {
      console.error("Failed to update seller profile:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller Profile</CardTitle>
        <CardDescription>
          Configure your business details. This information will appear on
          receipts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your Bakery Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="business_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Address</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="123 Pastry Lane, Bakeville, VIC 3000"
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
              name="ABN_or_ACN"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ABN / ACN</FormLabel>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="hello@yourbakery.com"
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
                        placeholder="07 1234 5678"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="logo_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://yourbakery.com/logo.png"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
