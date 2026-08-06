import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

export const buttonVariants = cva('btn ui-button', {
  variants: {
    variant: {
      // Six visually distinct variants. Legacy aliases (default/destructive/
      // outline/ghost/link) are kept in the type so existing call sites keep
      // working, but they normalize onto the canonical six below.
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      subtle: 'btn-subtle',
      ghost: 'btn-text',
      danger: 'btn-danger',
      link: 'btn-link',
      // --- legacy aliases (do not add new usages) ---
      default: 'btn-primary',
      destructive: 'btn-danger',
      outline: 'btn-secondary',
      text: 'btn-text',
    },
    size: {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg',
      default: '',
      icon: 'btn-sm ui-button-icon',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
      {
      variant = 'primary',
      size = 'md',
      icon,
      iconPosition = 'left',
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), icon ? 'btn-with-icon' : '', className)}
      data-slot="button"
      data-state="default"
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {icon && iconPosition === 'left' ? icon : null}
      {children}
      {icon && iconPosition === 'right' ? icon : null}
    </button>
  ),
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  surface?: 'topbar' | 'plain';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, surface = 'plain', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(surface === 'topbar' ? 'topbar-icon-button' : 'icon-button', 'ui-icon-button', className)}
      aria-label={label}
      title={label}
      data-slot="icon-button"
      data-state="default"
      {...props}
    >
      {icon}
    </button>
  ),
);

IconButton.displayName = 'IconButton';
