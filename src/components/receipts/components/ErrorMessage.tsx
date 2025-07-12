import { Button } from '@/components/ui/button';

interface ErrorMessageProps {
  message: string;
  receiptId?: string;
}

export function ErrorMessage({ message, receiptId }: ErrorMessageProps) {
  const handleGoBack = () => {
    if (window.opener) {
      window.close();
    } else {
      window.history.back();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="error-message">
      <div className="text-center space-y-4">
        <div className="text-red-600 text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900">Error Loading Receipt</h1>
        {receiptId && (
          <p className="text-gray-600">Receipt ID: {receiptId}</p>
        )}
        <p className="text-red-600 max-w-md mx-auto">{message}</p>
        <Button onClick={handleGoBack} variant="outline">
          Go Back
        </Button>
      </div>
    </div>
  );
}
