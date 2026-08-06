import React from 'react';
import { cn } from './utils';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarContextValue {
  imageLoaded: boolean;
  setImageLoaded: React.Dispatch<React.SetStateAction<boolean>>;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

function useAvatarContext() {
  return React.useContext(AvatarContext);
}

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: AvatarSize;
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size = 'md', children, ...props }, ref) => {
    const [imageLoaded, setImageLoaded] = React.useState(false);

    return (
      <AvatarContext.Provider value={{ imageLoaded, setImageLoaded }}>
        <span
          ref={ref}
          className={cn(
            'ui-avatar relative flex shrink-0 overflow-hidden rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]',
            size === 'sm' && 'size-7 text-xs',
            size === 'md' && 'size-9 text-sm',
            size === 'lg' && 'size-12 text-base',
            size === 'xl' && 'size-16 text-lg',
            className,
          )}
          data-slot="avatar"
          data-state={imageLoaded ? 'loaded' : 'fallback'}
          data-size={size}
          {...props}
        >
          {children}
        </span>
      </AvatarContext.Provider>
    );
  },
);

Avatar.displayName = 'Avatar';

export const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, src, onLoad, onError, ...props }, ref) => {
    const context = useAvatarContext();

    React.useEffect(() => {
      context?.setImageLoaded(false);
    }, [context, src]);

    return (
      <img
        ref={ref}
        src={src}
        className={cn('ui-avatar-image aspect-square size-full object-cover transition-opacity', context?.imageLoaded ? 'opacity-100' : 'opacity-0', className)}
        aria-hidden={context?.imageLoaded ? undefined : true}
        data-slot="avatar-image"
        data-state={context?.imageLoaded ? 'loaded' : 'loading'}
        onLoad={(event) => {
          context?.setImageLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          context?.setImageLoaded(false);
          onError?.(event);
        }}
        {...props}
      />
    );
  },
);

AvatarImage.displayName = 'AvatarImage';

export const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    const context = useAvatarContext();

    return (
      <span
        ref={ref}
        className={cn('ui-avatar-fallback absolute inset-0 flex items-center justify-center font-medium', className)}
        aria-hidden={context?.imageLoaded || undefined}
        data-slot="avatar-fallback"
        data-state={context?.imageLoaded ? 'hidden' : 'visible'}
        {...props}
      />
    );
  },
);

AvatarFallback.displayName = 'AvatarFallback';
