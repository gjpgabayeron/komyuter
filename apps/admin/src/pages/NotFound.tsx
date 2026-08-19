import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Compass />
          </EmptyMedia>
          <EmptyTitle className="text-base font-semibold">
            Page not found
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </EmptyDescription>
          <Button render={<Link to="/" />}>Back to Overview</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
