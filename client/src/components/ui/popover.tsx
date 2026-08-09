import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverArrow = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow>
>(({ className, width = 12, height = 6, ...props }, ref) => (
  <PopoverPrimitive.Arrow
    ref={ref}
    width={width}
    height={height}
    className={cn("fill-white drop-shadow-[0_-1px_0_rgba(226,232,240,1)]", className)}
    {...props}
  />
))
PopoverArrow.displayName = PopoverPrimitive.Arrow.displayName

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "gt-canon-pop z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none [body.gt-admin_&]:rounded-xl [body.gt-admin_&]:border-[var(--apple-hairline)] [body.gt-admin_&]:shadow-[0_12px_32px_rgba(0,0,0,0.10)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverArrow }
