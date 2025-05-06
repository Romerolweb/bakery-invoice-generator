"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath, // Importing types explicitly
  type FieldValues, // Importing types explicitly
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label"; // Assuming Label is already typed

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    // Explicitly returning JSX
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  // Check if formState exists before accessing getFieldState
  // This can happen if useFormField is used outside a FormProvider
  // or if the form hasn't fully initialized yet.
  if (!formState) {
    console.warn(
      "useFormField used outside of a FormProvider or before form initialization.",
    );
    // Return default values or throw a more specific error
    return {
      // Explicitly returning an object
      id: itemContext?.id || "", // Use optional chaining for itemContext
      name: fieldContext?.name || "", // Use optional chaining for fieldContext
      formItemId: itemContext?.id ? `${itemContext.id}-form-item` : "form-item", // More precise ternary
      formDescriptionId: itemContext?.id
        ? `${itemContext.id}-form-item-description`
        : "form-item-description", // More precise ternary
      formMessageId: itemContext?.id
        ? `${itemContext.id}-form-item-message`
        : "form-item-message", // More precise ternary
      invalid: false,
      isDirty: false,
      isTouched: false,
      isValidating: false,
      error: undefined,
    };
  }
  // At this point, we assume formState exists

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }
  if (!itemContext) {
    // This might happen if FormItem context is somehow lost, though less likely
    console.warn("FormItem context not found within useFormField.");
    // Provide default IDs based only on field name if necessary
    const baseId = fieldContext.name.replace(/[\.\[\]]/g, "-"); // Simple ID generation
    return {
      // Explicitly returning an object
      id: baseId,
      name: fieldContext.name,
      formItemId: `${baseId}-form-item`,
      formDescriptionId: `${baseId}-form-item-description`,
      formMessageId: `${baseId}-form-item-message`,
      ...fieldState, // Spread the fieldState properties
    };
  }
  // At this point, we assume both contexts exist

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};
// Define the type for FormItemContextValue
type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  ); // Explicitly returning JSX
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField(); // Destructuring hook result

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  ); // Explicitly returning JSX
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField(); // Destructuring hook result

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  ); // Explicitly returning JSX
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField(); // Destructuring hook result

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ); // Explicitly returning JSX
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  // Destructuring props
  const { error, formMessageId } = useFormField(); // Destructuring hook result
  const body = error ? String(error?.message ?? "") : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  ); // Explicitly returning JSX
});
FormMessage.displayName = "FormMessage";

export {
  useFormField, // Export the hook
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
