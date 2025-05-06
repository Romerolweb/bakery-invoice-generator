import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "./customers";
import type * as fs from "fs/promises";
import path from "path";
import { Customer } from "../types";

vi.mock("path");
vi.mock("fs/promises", () => {
  const mockFs = {
    readFile: vi.fn(() => Promise.resolve("[]")), // Default to empty array
    writeFile: vi.fn(),
  };
});

describe("Customer Data Access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockFs = vi.mocked(require("fs/promises"));

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
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCustomers));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const customers = await getAllCustomers();
      expect(customers).toEqual(mockCustomers);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        "mocked/path/customers.json",
        "utf8",
      );
    });

    it("should return an empty array if there is an error", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
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
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCustomers));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const customer = await getCustomerById("1");
      expect(customer).toEqual(mockCustomers[0]);
    });

    it("should return null if customer is not found", async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify([{ id: "1" }]));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const customer = await getCustomerById("2");
      expect(customer).toBeNull();
    });

    it("should return null if there is an error", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const customer = await getCustomerById("1");
      expect(customer).toBeNull();
    });
  });

  describe("createCustomer", () => {
    it("should create a new customer", async () => {
      const initialCustomers: Customer[] = [];
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(initialCustomers)); // First call to readFile in getAllCustomers
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(initialCustomers)); // Second call in createCustomer itself

      // We don't need to mock writeFile initially, the function under test does that
      mockFs.writeFile.mockResolvedValue();
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
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
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "mocked/path/customers.json",
        expect.stringContaining('"first_name":"Jane"'),
      );
    });
    it("should return null if there is an error", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
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
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // First call to readFile in getAllCustomers
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // Second call in updateCustomer itself

      // We don't need to mock writeFile initially
      mockFs.writeFile.mockResolvedValueOnce();
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
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
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "mocked/path/customers.json",
        expect.stringContaining('"first_name":"Johnny"'),
      );
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
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const updatedCustomerData: Partial<Omit<Customer, "id">> = {
        first_name: "Johnny",
      };
      const updatedCustomer = await updateCustomer("2", updatedCustomerData);
      expect(updatedCustomer).toBeNull();
    });
    it("should return null if there is an error", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File read error"));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
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
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // First call to readFile in getAllCustomers
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers)); // Second call in deleteCustomer itself

      // We don't need to mock writeFile initially
      mockFs.writeFile.mockResolvedValue();
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const deleted = await deleteCustomer("1");
      expect(deleted).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "mocked/path/customers.json",
        expect.stringContaining("[]"),
      );
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
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockCustomers));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const deleted = await deleteCustomer("2");
      expect(deleted).toBe(false);
    });

    it("should return false if there is an error", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File read error"));
      vi.mocked(path.join).mockReturnValue("mocked/path/customers.json");
      const deleted = await deleteCustomer("1");

      expect(deleted).toBe(false);
    });
  });
});
