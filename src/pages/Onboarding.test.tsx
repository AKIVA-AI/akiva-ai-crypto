import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from './Onboarding';

describe('OnboardingWizard', () => {
  it('renders welcome step initially', () => {
    render(<OnboardingWizard />);
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
    expect(screen.getByText(/enterprise crypto/i)).toBeInTheDocument();
  });

  it('shows step indicators', () => {
    render(<OnboardingWizard />);
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('navigates from welcome to risk profile', () => {
    render(<OnboardingWizard />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/risk profile/i)).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it('navigates from risk profile to trading preferences', () => {
    render(<OnboardingWizard />);
    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    // Go to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/trading preferences/i)).toBeInTheDocument();
    expect(screen.getByText(/step 3 of 3/i)).toBeInTheDocument();
  });

  it('allows navigating back', () => {
    render(<OnboardingWizard />);
    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/risk profile/i)).toBeInTheDocument();
    // Go back
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
  });

  it('shows risk level options on step 2', () => {
    render(<OnboardingWizard />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/conservative/i)).toBeInTheDocument();
    expect(screen.getByText(/moderate/i)).toBeInTheDocument();
    expect(screen.getByText(/aggressive/i)).toBeInTheDocument();
  });

  it('shows trading preference fields on step 3', () => {
    render(<OnboardingWizard />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByLabelText(/max position size/i)).toBeInTheDocument();
    expect(screen.getByText(/preferred assets/i)).toBeInTheDocument();
  });

  it('submits preferences on completion', () => {
    render(<OnboardingWizard />);
    // Navigate to end
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));
    expect(screen.getByText(/setup complete/i)).toBeInTheDocument();
  });
});
