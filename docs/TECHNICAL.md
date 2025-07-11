# Technical Documentation

## Overview

This document provides detailed technical information for developers working on the Invoice Generator application. It covers architecture decisions, implementation details, and guidelines for extending the system.

## Architecture Overview

### Core Principles

1. **Separation of Concerns**: Clear boundaries between data access, business logic, and presentation
2. **Type Safety**: Comprehensive TypeScript usage throughout the application
3. **Template-Based PDF Generation**: Extensible system for different PDF layouts
4. **Server Actions**: Next.js server actions for secure server-side operations
5. **Component Composition**: Reusable UI components following Shadcn patterns

### Technology Stack

#### Frontend
- **Next.js 15.3.3** with App Router
- **React 18** with Server Components
- **TypeScript 5.8+** for type safety
- **Tailwind CSS** for styling
- **Shadcn UI** for component library

#### Backend
- **Next.js API Routes** for endpoints
- **Server Actions** for form handling
- **File-based JSON storage** for data persistence
- **PDFKit** for PDF generation

#### Development
- **Vitest** for unit testing
- **ESLint** for code quality
- **Prettier** for code formatting
- **Docker** for containerization

## Data Architecture

### Storage Strategy

The application uses file-based JSON storage for simplicity and portability:

```
src/lib/data/
├── customers.json       # Customer records
├── products.json        # Product catalog
├── receipts.json        # Receipt/invoice records
├── seller-profile.json  # Business information
└── receipt-pdfs/        # Generated PDF files
```

### Data Access Layer

Located in `src/lib/data-access/`, this layer provides:

- **Type-safe data operations**
- **Error handling and validation**
- **Consistent interface across data types**
- **File system abstraction**

Example data access pattern:
```typescript
// src/lib/data-access/customers.ts
export async function getCustomers(): Promise<Customer[]> {
  // File reading, parsing, and validation logic
}

export async function saveCustomer(customer: Customer): Promise<void> {
  // Validation and file writing logic
}
```

### Server Actions Layer

Located in `src/lib/actions/`, this layer handles:

- **Form submissions**
- **Data validation with Zod schemas**
- **Business logic coordination**
- **Error handling and user feedback**

## PDF Generation System

### Architecture

The PDF generation system uses a template-based architecture for flexibility and maintainability:

```
PdfGenerator (Orchestrator)
    ↓
Template Registry (Configuration)
    ↓
IPdfReceiptTemplate (Interface)
    ↓
DefaultReceiptTemplate (Implementation)
    ↓
PDFKit (Engine)
```

### Key Components

#### 1. IPdfReceiptTemplate Interface

Defines the contract for all PDF templates:

```typescript
export interface IPdfReceiptTemplate {
  doc: PDFKit.PDFDocument;
  logPrefix: string;
  
  setDocument(doc: PDFKit.PDFDocument): void;
  setLogPrefix(logPrefix: string): void;
  addHeader(isTaxInvoice: boolean): void;
  addSellerInfo(seller: SellerProfile): void;
  addCustomerInfo(customer: Omit<Customer, "id">): void;
  addInvoiceInfo(invoiceId: string, dateIsoString: string): void;
  addItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void;
  addTotals(subtotal: number, gstAmount: number, total: number, includeGST: boolean): void;
  addFooter(notes?: string): void;
}
```

#### 2. Template Registry

Centralizes template configuration:

```typescript
export const PDF_TEMPLATE_CONFIG = {
  DEFAULT: "default",
  // Add new templates here
} as const;

export const CURRENT_PDF_TEMPLATE = PDF_TEMPLATE_CONFIG.DEFAULT;
```

#### 3. PdfGenerator Service

Orchestrates the PDF creation process:

1. **Initialization**: Sets up PDFKit document and file streams
2. **Template Setup**: Instantiates and configures the selected template
3. **Content Generation**: Delegates content creation to the template
4. **Finalization**: Handles file writing and cleanup
5. **Error Handling**: Manages failures and cleanup

### Adding New PDF Templates

1. **Create Template Class**:
   ```typescript
   // src/lib/services/pdfTemplates/ModernReceiptTemplate.ts
   export class ModernReceiptTemplate implements IPdfReceiptTemplate {
     // Implement all interface methods
   }
   ```

2. **Register Template**:
   ```typescript
   // src/lib/services/pdfTemplates/templateRegistry.ts
   export const PDF_TEMPLATE_CONFIG = {
     DEFAULT: "default",
     MODERN: "modern",  // Add new template
   } as const;
   ```

3. **Configure Selection**:
   ```typescript
   export const CURRENT_PDF_TEMPLATE = PDF_TEMPLATE_CONFIG.MODERN;
   ```

## Component Architecture

### UI Component Structure

```
src/components/ui/
├── button.tsx          # Base button component
├── form.tsx            # Form components with validation
├── input.tsx           # Input field components
├── table.tsx           # Data table components
└── ...                 # Other Shadcn UI components
```

### Page Components

Each page in `src/app/` follows this pattern:

```typescript
// Page component structure
export default function PageName() {
  return (
    <div>
      <PageHeader />
      <PageContent />
      <PageActions />
    </div>
  );
}
```

### Form Handling Pattern

Forms use React Hook Form with Zod validation:

```typescript
const formSchema = z.object({
  field: z.string().min(1, "Required field"),
});

const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
});

const onSubmit = async (data: z.infer<typeof formSchema>) => {
  // Server action call
  const result = await serverAction(data);
  // Handle result
};
```

## Error Handling Strategy

### Client-Side Error Handling

1. **Form Validation**: Zod schemas with React Hook Form
2. **API Errors**: Toast notifications for user feedback
3. **Loading States**: Proper loading indicators
4. **Error Boundaries**: React error boundaries for crash protection

### Server-Side Error Handling

1. **Validation**: Input validation with Zod schemas
2. **File Operations**: Proper error handling for file I/O
3. **PDF Generation**: Comprehensive error handling with cleanup
4. **Logging**: Structured logging for debugging

### Error Response Pattern

```typescript
type ActionResult<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
};
```

## Testing Strategy

### Unit Testing

- **Data Access Layer**: Test CRUD operations
- **Server Actions**: Test business logic and validation
- **PDF Generation**: Test template rendering and file creation
- **Utilities**: Test helper functions

### Testing Tools

- **Vitest**: Fast unit test runner
- **Testing Library**: Component testing utilities
- **Mock Functions**: For external dependencies

### Test Structure

```typescript
describe('Component/Function Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should handle expected behavior', () => {
    // Test implementation
  });

  it('should handle error cases', () => {
    // Error testing
  });
});
```

## Performance Considerations

### Frontend Performance

1. **Server Components**: Use React Server Components where possible
2. **Code Splitting**: Lazy load heavy components
3. **Image Optimization**: Next.js Image component
4. **Bundle Analysis**: Regular bundle size monitoring

### Backend Performance

1. **File I/O**: Efficient JSON parsing and writing
2. **PDF Generation**: Memory-efficient PDFKit usage
3. **Caching**: Consider caching for repeated operations
4. **Resource Cleanup**: Proper stream and file handle cleanup

## Security Considerations

### Input Validation

- **Zod Schemas**: Validate all user inputs
- **File Uploads**: Validate file types and sizes
- **SQL Injection**: N/A (using JSON storage)
- **XSS Protection**: React's built-in protection

### File Security

- **Path Traversal**: Validate file paths
- **File Permissions**: Proper file system permissions
- **PDF Generation**: Sanitize content for PDF generation

## Development Guidelines

### Code Style

1. **TypeScript**: Use strict mode, explicit types
2. **ESLint**: Follow Next.js recommended rules
3. **Prettier**: Consistent code formatting
4. **Naming**: Descriptive, consistent naming conventions

### Git Workflow

1. **Feature Branches**: One feature per branch
2. **Commit Messages**: Descriptive commit messages
3. **Pull Requests**: Code review before merging
4. **Testing**: All tests must pass before merging

### Adding New Features

1. **Types First**: Define TypeScript types
2. **Data Layer**: Implement data access methods
3. **Business Logic**: Add server actions
4. **UI Components**: Create reusable components
5. **Testing**: Add comprehensive tests
6. **Documentation**: Update relevant documentation

## Deployment

### Environment Variables

```bash
# Required
PORT=9002
PDF_GENERATOR=pdfkit

# Optional
NODE_ENV=production
DEBUG=*
```

### Docker Deployment

The application includes optimized Docker configuration:

- **Multi-stage builds** for smaller production images
- **Non-root user** for security
- **Health checks** for monitoring
- **Volume mounts** for persistent data

### Production Checklist

- [ ] Environment variables configured
- [ ] File permissions set correctly
- [ ] PDF directory writable
- [ ] Memory limits appropriate
- [ ] Health monitoring configured
- [ ] Backup strategy for JSON data
- [ ] SSL certificates installed
- [ ] Error logging configured

## Monitoring and Debugging

### Logging

The application uses structured logging:

```typescript
import { logger } from '@/lib/services/logging';

logger.info('Operation completed', { userId, operation });
logger.error('Operation failed', error);
```

### Debug Mode

Enable detailed logging:

```bash
export NODE_ENV=development
export DEBUG=*
```

### Common Debug Scenarios

1. **PDF Generation Issues**: Check font paths and permissions
2. **Data Access Errors**: Verify JSON file structure
3. **Type Errors**: Run `npm run typecheck`
4. **Build Issues**: Clear `.next` and `node_modules`

## Future Enhancements

### Potential Improvements

1. **Database Integration**: Replace JSON with PostgreSQL/MongoDB
2. **Authentication**: Add user authentication system
3. **Multi-tenant**: Support multiple businesses
4. **Email Integration**: Send invoices via email
5. **Payment Integration**: Add payment processing
6. **API Endpoints**: RESTful API for external integrations
7. **Mobile App**: React Native mobile application
8. **Advanced PDF Templates**: More sophisticated layouts
9. **Reporting**: Business analytics and reporting
10. **Backup System**: Automated data backup

### Scalability Considerations

1. **Database**: Move to proper database system
2. **File Storage**: Cloud storage for PDFs
3. **Caching**: Redis for session and data caching
4. **Load Balancing**: Multiple application instances
5. **CDN**: Content delivery network for assets
6. **Monitoring**: Application performance monitoring

## Troubleshooting Guide

### Common Issues

#### PDF Generation Fails
- Check font file permissions
- Verify PDFKit installation
- Check available disk space
- Review error logs

#### Type Errors
- Run `npm run typecheck`
- Check import statements
- Verify interface implementations
- Clear TypeScript cache

#### Build Failures
- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check TypeScript configuration
- Verify environment variables

#### Docker Issues
- Check Dockerfile syntax
- Verify file permissions
- Check Docker Compose configuration
- Review container logs

### Debug Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Test suite
npm run test

# Clean rebuild
rm -rf .next node_modules package-lock.json
npm install
npm run build

# Docker debug
docker-compose logs app
docker-compose exec app sh
```

## Contributing

### Setting Up Development Environment

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Set up environment**: Copy `.env.dev.example` to `.env.dev`
4. **Start development**: `npm run dev`
5. **Run tests**: `npm test`

### Code Review Guidelines

1. **Functionality**: Does the code work as intended?
2. **Type Safety**: Are types properly defined and used?
3. **Testing**: Are there adequate tests for new features?
4. **Performance**: Any performance implications?
5. **Security**: Any security considerations?
6. **Documentation**: Is documentation updated?

---

This technical documentation should be updated as the project evolves to maintain accuracy and usefulness for future development.
