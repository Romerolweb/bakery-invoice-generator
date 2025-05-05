// src/lib/actions/receipts.ts
'use server';

import { Receipt, LineItem, Product, SellerProfile, Customer } from '@/lib/types';
import { createNewReceipt as createReceiptData, getAllReceipts as getAllReceiptsData, getReceiptById as getReceiptByIdData } from '@/lib/data-access/receipts';
import { getAllProducts } from '@/lib/data-access/products';
import { getSellerProfile } from '@/lib/data-access/seller';
import { getCustomerById } from '@/lib/data-access/customers';
import { v4 as uuidv4 } from 'uuid';

interface CreateReceiptResult {
    success: boolean;
    message?: string;
    receipt?: { receipt_id: string };
    pdfPath?: string;
    pdfError?: string;
}

interface SubmissionLineItem {
    product_id: string;
    quantity: number;
}

interface CreateReceiptParams {
    customer_id: string;
    date_of_purchase: string;
    line_items: SubmissionLineItem[];
    include_gst: boolean;
    force_tax_invoice: boolean;
}

export async function createReceipt(data: CreateReceiptParams): Promise<CreateReceiptResult> {
    try {
        const products = await getAllProducts();
        const sellerProfile = await getSellerProfile();
        const customer = await getCustomerById(data.customer_id);

        if (!products || products.length === 0) {
            return { success: false, message: 'No products found.' };
        }

        if (!sellerProfile) {
            return { success: false, message: 'No seller profile found.' };
        }
        if(!customer){
            return { success: false, message: 'No customer found.' };
        }

        const lineItems: LineItem[] = data.line_items.map((item) => {
            const product = products.find((p) => p.id === item.product_id);
            if (!product) {
                throw new Error(`Product with ID ${item.product_id} not found.`);
            }
            const lineTotal = product.unit_price * item.quantity;
            return {
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: product.unit_price,
                line_total: lineTotal,
                product_name: product.name,
                GST_applicable: product.GST_applicable,
            };
        });

        const subtotalExclGST = lineItems.reduce((sum, item) => sum + item.line_total, 0);
        let GSTAmount = 0;
        if (data.include_gst) {
            GSTAmount = lineItems.reduce((sum, item) => {
                if(item.GST_applicable){
                   return sum + (item.line_total * 0.1); 
                }else {
                    return sum
                }
            }, 0);
        }
        

        const totalIncGST = subtotalExclGST + GSTAmount;

        const newReceipt: Receipt = {
            receipt_id: uuidv4(),
            customer_id: data.customer_id,
            date_of_purchase: data.date_of_purchase,
            line_items: lineItems,
            subtotal_excl_GST: subtotalExclGST,
            GST_amount: GSTAmount,
            total_inc_GST: totalIncGST,
            is_tax_invoice: data.force_tax_invoice,
            seller_profile_snapshot: sellerProfile,
            customer_snapshot: {
              customer_type: customer.customer_type,
              first_name: customer.first_name,
              last_name: customer.last_name,
              business_name: customer.business_name,
              abn: customer.abn,
              email: customer.email,
              phone: customer.phone,
              address: customer.address,
            },
        };

        const createdReceipt = await createReceiptData(newReceipt);
        return { success: true, receipt: { receipt_id: createdReceipt.receipt_id } };
    } catch (error) {
        console.error('Error creating receipt:', error);
        return { success: false, message: (error as Error).message || 'Failed to create receipt.' };
    }
}

export async function getAllReceipts(): Promise<Receipt[]> {
    try {
        const receipts = await getAllReceiptsData();
        return receipts;
    } catch (error) {
        console.error('Error getting all receipts:', error);
        return [];
    }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
    try {
        const receipt = await getReceiptByIdData(id);
        return receipt;
    } catch (error) {
        console.error(`Error getting receipt by ID ${id}:`, error);
        return null;
    }
}