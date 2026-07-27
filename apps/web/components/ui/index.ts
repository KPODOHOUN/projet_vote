// Surface d'import stable des primitives UI.
// Usage : import { Button, Input, StatusChip, FormError, ... } from "@/components/ui";
//
// Les primitives historiques (Button/Input/StatusChip/EmptyState/KpiCard/TrustBadge)
// sont désormais des adaptateurs rendus sur shadcn (primitives.tsx) — même API,
// internes shadcn + correctifs d'accessibilité.

// Primitives adaptées (API historique conservée)
export {
  Button,
  Input,
  StatusChip,
  EmptyState,
  KpiCard,
  TrustBadge,
} from "./primitives";
export type {
  ButtonProps,
  InputProps,
  StatusChipProps,
  EmptyStateProps,
  KpiCardProps,
  TrustBadgeProps,
} from "./primitives";

// Nouveaux composants partagés (correctifs systémiques)
export { FormError } from "./form-error";
export type { FormErrorProps } from "./form-error";
export { LoadingState } from "./loading-state";
export type { LoadingStateProps } from "./loading-state";
export { ConfirmDialog } from "./confirm-dialog";
export type { ConfirmDialogProps } from "./confirm-dialog";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

// Réexport direct des composants shadcn bruts (pour usage avancé dans les pages)
export { Button as ShadcnButton, buttonVariants } from "./button";
export { Badge } from "./badge";
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
export { Checkbox } from "./checkbox";
export { Label } from "./label";
export { Skeleton } from "./skeleton";
export { Toaster } from "./sonner";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
