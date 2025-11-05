import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "./customers";
import * as fs from "fs/promises";
import { Customer } from "../types";

// Mock modules before importing
vi.mock("fs/promises");
vi.mock("@/lib/services/logging", () => ({
  logger: {
    debug: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Customer Data Access", () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllCustomers", () => {
    it("should return all customers", async () => {
      const mockCustomers: Customer[] = [
        {
          id: "1",
          customer_type: "individual",
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "1234567890",
          address: "1 Test St",
        },
        {
          id: "2",
          customer_type: "business",
          business_name: "Acme Corp",
          abn: "123456789",
          email: "info@acme.com",
          phone: "9876543210",
          address: "2 Business Ave",
        },
      ];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCustomers));
      const customers = await getAllCustomers();
      expect(customers).toEqual(mockCustomers);
      expect(mockFs.readFile).toHaveBeenCalled();
      expect(mockFs.mkdir).toHaveBeenCalled();
    });

    it("should return an empty array if there is an error", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      const enoentError = new Error("File not found") as NodeJS.ErrnoException;
      enoentError.code = "ENOENT";
      mockFs.readFile.mockRejectedValue(enoentError);
      const customers = await getAllCustomers();
      expect(customers).toEqual([]);
    });
  });

  describe("getCustomerById", () => {
    it("should return a customer by ID", async () => {
      const mockCustomers: Customer[] = [
        {
          id: "1",
          customer_type: "individual",
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "1234567890",
          address: "1 Test St",
        },
        {
          id: "2",
          customer_type: "business",
          business_name: "Acme Corp",
          abn: "123456789",
          email: "info@acme.com",
          phone: "9876543210",
          address: "2 Business Ave",
        },
      ];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCustomers));
      const customer = await getCustomerById("1");
      expect(customer).toEqual(mockCustomers[0]);
    });

    it("should return null if customer is not found", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify([{ id: "1" }]));
      const customer = await getCustomerById("2");
      expect(customer).toBeNull();
    });

    it("should return null if there is an error", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      const readError = new Error("File read error");
      mockFs.readFile.mockRejectedValue(readError);
      const customer = await getCustomerById("1");
      expect(customer).toBeNull();
    });
  });

  describe("createCustomer", () => {
    it("should create a new customer", async () => {
      const initialCustomers: Customer[] = [];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(initialCustomers)); // First call to readFile in getAllCustomers
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(initialCustomers)); // Second call in createCustomer itself

      // We don't need to mock writeFile initially, the function under test does that
      mockFs.writeFile.mockResolvedValue();
      const newCustomerData: Omit<Customer, "id"> = {
        customer_type: "individual",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane.smith@example.com",
        phone: "0987654321",
        address: "3 New Rd",
      };
      const newCustomer = await createCustomer(newCustomerData);
      expect(newCustomer).toEqual(expect.objectContaining(newCustomerData));
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
    it("should return null if there is an error", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      const readError = new Error("File read error");
      mockFs.readFile.mockRejectedValue(readError);
      mockFs.writeFile.mockRejectedValue(readError); // Add this to make write fail too
      const newCustomerData: Omit<Customer, "id"> = {
        customer_type: "individual",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane.smith@example.com",
        phone: "0987654321",
        address: "3 New Rd",
      };
      const newCustomer = await createCustomer(newCustomerData);
      expect(newCustomer).toBeNull();
    });
  });

  describe("updateCustomer", () => {
    it("should update an existing customer", async () => {
      const mockCustomers: Customer[] = [
        {
          id: "1",
          customer_type: "individual",
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "1234567890",
          address: "1 Test St",
          business_name: "",
          abn: "",
        },
      ];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // First call to readFile in getAllCustomers
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // Second call in updateCustomer itself

      // We don't need to mock writeFile initially
      mockFs.writeFile.mockResolvedValueOnce();
      const updatedCustomerData: Partial<Omit<Customer, "id">> = {
        first_name: "Johnny",
      };
      const updatedCustomer = await updateCustomer("1", updatedCustomerData);
      expect(updatedCustomer).toEqual(
        expect.objectContaining({
          ...mockCustomers[0],
          ...updatedCustomerData,
        }),
      );
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
    it("should return null if customer is not found", async () => {
      const mockCustomers: Customer[] = [
        {
          id: "1",
          customer_type: "individual",
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "1234567890",
          address: "1 Test St",
          business_name: "",
          abn: "",
        },
      ];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers));
      const updatedCustomerData: Partial<Omit<Customer, "id">> = {
        first_name: "Johnny",
      };
      const updatedCustomer = await updateCustomer("2", updatedCustomerData);
      expect(updatedCustomer).toBeNull();
    });
    it("should return null if there is an error", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      const readError = new Error("File read error");
      mockFs.readFile.mockRejectedValue(readError);
      const updatedCustomerData: Partial<Omit<Customer, "id">> = {
        first_name: "Johnny",
      };

      const updatedCustomer = await updateCustomer("2", updatedCustomerData);
      expect(updatedCustomer).toBeNull();
    });
  });

  describe("deleteCustomer", () => {
    it("should delete an existing customer", async () => {
      const mockCustomers: Customer[] = [
        {
          id: "1",
          customer_type: "individual",
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "1234567890",
          address: "1 Test St",
          business_name: "",
          abn: "",
        },
      ];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // First call to readFile in getAllCustomers
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // Second call in deleteCustomer itself

      // We don't need to mock writeFile initially
      mockFs.writeFile.mockResolvedValue();
      const deleted = await deleteCustomer("1");
      expect(deleted).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
    it("should return false if customer is not found", async () => {
      const mockCustomers: Customer[] = [
        {
          id: "1",
          customer_type: "individual",
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "1234567890",
          address: "1 Test St",
          business_name: "",
          abn: "",
        },
      ];
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers));
      const deleted = await deleteCustomer("2");
      expect(deleted).toBe(false);
    });

    it("should return false if there is an error", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue("[]"); // Return empty array
      mockFs.writeFile.mockRejectedValue(new Error("Write error")); // Make write fail
      const deleted = await deleteCustomer("1");

      expect(deleted).toBe(false);
    });
  });
});
