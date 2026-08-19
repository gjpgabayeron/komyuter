import { Download } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function Export() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Download />
          </EmptyMedia>
          <EmptyTitle className="text-base font-semibold">
            Nothing to export yet
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            Dataset export arrives in a later milestone.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    </div>
  );
}
