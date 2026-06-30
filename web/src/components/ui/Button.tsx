import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      icon,
      iconPosition = 'left',
      className = '',
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const classes = [
      'btn',
      `btn-${variant}`,
      size !== 'md' ? `btn-${size}` : '',
      icon ? 'btn-with-icon' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} type={type} className={classes} {...props}>
        {icon && iconPosition === 'left' ? icon : null}
        {children}
        {icon && iconPosition === 'right' ? icon : null}
      </button>
    );
  },
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  surface?: 'topbar' | 'plain';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, surface = 'plain', className = '', type = 'button', ...props }, ref) => {
    const classes = [
      surface === 'topbar' ? 'topbar-icon-button' : 'icon-button',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...props}>
        {icon}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
