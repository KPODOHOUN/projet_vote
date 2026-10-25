"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dialogue de confirmation pour les actions destructives ou irréversibles
 * (ex. purge des journaux d'audit). Le `trigger` ouvre la modale ; `onConfirm`
 * n'est appelé qu'après confirmation explicite. AlertDialog (Radix) gère le focus
 * trap, l'échap, et l'annonce lecteur d'écran.
 */
export interface ConfirmDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: "destructive" | "default";
  /** Style destructif (rouge) sur le bouton de confirmation. */
  destructive?: boolean;
  /** Désactive le déclencheur (ex. action en cours). */
  disabled?: boolean;
  /** Désactive le bouton de confirmation (ex. champ obligatoire vide dans `children`). */
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  children,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuler",
  onConfirm,
  variant,
  destructive = true,
  disabled,
  confirmDisabled,
}: ConfirmDialogProps) {
  const isDestructive = variant ? variant === "destructive" : destructive;
  return (
    <AlertDialog
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? (
        <AlertDialogTrigger asChild disabled={disabled}>
          {trigger}
        </AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={cn(
              isDestructive &&
                buttonVariants({ variant: "destructive" })
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
