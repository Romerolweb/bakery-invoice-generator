import { describe, it, expect } from 'vitest';
import { reducer, State } from '@/hooks/use-toast';

// Infer types from the reducer signature and State interface
type Action = Parameters<typeof reducer>[1];
type ToasterToast = State['toasts'][0];

describe('use-toast reducer', () => {
  const initialToast: ToasterToast = {
    id: '1',
    title: 'Test Toast',
    description: 'This is a test toast',
    open: true,
  };

  const initialState: State = {
    toasts: [initialToast],
  };

  const emptyState: State = {
    toasts: [],
  };

  describe('ADD_TOAST', () => {
    it('should add a toast to empty state', () => {
      const newToast: ToasterToast = {
        id: '2',
        title: 'New Toast',
        open: true,
      };

      const action: Action = {
        type: 'ADD_TOAST',
        toast: newToast,
      };

      const newState = reducer(emptyState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(newToast);
    });

    it('should replace existing toast with new one (due to TOAST_LIMIT=1)', () => {
      const newToast: ToasterToast = {
        id: '2',
        title: 'New Toast',
        open: true,
      };

      const action: Action = {
        type: 'ADD_TOAST',
        toast: newToast,
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(newToast);
    });
  });

  describe('UPDATE_TOAST', () => {
    it('should update an existing toast', () => {
      const update: Partial<ToasterToast> = {
        id: '1',
        title: 'Updated Title',
      };

      const action: Action = {
        type: 'UPDATE_TOAST',
        toast: update,
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].title).toBe('Updated Title');
      expect(newState.toasts[0].description).toBe('This is a test toast');
    });

    it('should not update a non-existent toast', () => {
      const update: Partial<ToasterToast> = {
        id: '999',
        title: 'Updated Title',
      };

      const action: Action = {
        type: 'UPDATE_TOAST',
        toast: update,
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(initialToast);
    });
  });

  describe('DISMISS_TOAST', () => {
    it('should mark a specific toast as closed (open: false)', () => {
      const action: Action = {
        type: 'DISMISS_TOAST',
        toastId: '1',
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].open).toBe(false);
    });

    it('should mark all toasts as closed if no toastId provided', () => {
      // Create state with multiple toasts if TOAST_LIMIT allowed it, but currently LIMIT=1
      // We can artificially create a state with multiple toasts to test this behavior of reducer
      const multiToastState: State = {
        toasts: [
          { id: '1', open: true },
          { id: '2', open: true },
        ],
      };

      const action: Action = {
        type: 'DISMISS_TOAST',
      };

      const newState = reducer(multiToastState, action);

      expect(newState.toasts).toHaveLength(2);
      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(false);
    });

    it('should handle dismissing non-existent toast gracefully', () => {
      const action: Action = {
        type: 'DISMISS_TOAST',
        toastId: '999',
      };

      const newState = reducer(initialState, action);

      // Should remain unchanged except maybe open status if logic was different,
      // but logic checks id match.
      expect(newState.toasts[0].open).toBe(true);
    });
  });

  describe('REMOVE_TOAST', () => {
    it('should remove a specific toast', () => {
      const action: Action = {
        type: 'REMOVE_TOAST',
        toastId: '1',
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(0);
    });

    it('should remove all toasts if no toastId provided', () => {
      const multiToastState: State = {
        toasts: [
          { id: '1', open: true },
          { id: '2', open: true },
        ],
      };

      const action: Action = {
        type: 'REMOVE_TOAST',
      };

      const newState = reducer(multiToastState, action);

      expect(newState.toasts).toHaveLength(0);
    });

    it('should handle removing non-existent toast gracefully', () => {
      const action: Action = {
        type: 'REMOVE_TOAST',
        toastId: '999',
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(initialToast);
    });
  });
});
