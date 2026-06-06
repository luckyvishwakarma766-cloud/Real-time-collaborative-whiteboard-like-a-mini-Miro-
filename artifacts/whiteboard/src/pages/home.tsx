import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateRoom } from "@workspace/api-client-react";
import { Pencil, Users, MousePointer2 } from "lucide-react";
import { toast } from "sonner";

const FUN_NAMES = [
  "Brainstorming Blitz",
  "Design Sync",
  "Wireframe Magic",
  "Idea Board",
  "Flow Space"
];

export function Home() {
  const [, setLocation] = useLocation();
  const [roomId, setRoomId] = useState("");
  const createRoom = useCreateRoom();

  const handleCreate = () => {
    const randomName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    createRoom.mutate(
      { data: { name: randomName } },
      {
        onSuccess: (room) => {
          setLocation(`/board/${room.id}`);
        },
        onError: () => {
          toast.error("Failed to create room");
        }
      }
    );
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    setLocation(`/board/${roomId.trim()}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        
        <div className="space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4">
            <Pencil className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            BoardFlow
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            A precise, tactile whiteboard for small teams. Think with your hands in real time.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 pt-8 max-w-md mx-auto">
          <div className="space-y-4 text-left p-6 rounded-xl border bg-card">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <MousePointer2 className="h-5 w-5 text-primary" /> Start Fresh
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a new infinite canvas and invite your team.
            </p>
            <Button 
              className="w-full" 
              onClick={handleCreate}
              disabled={createRoom.isPending}
            >
              {createRoom.isPending ? "Creating..." : "Create Board"}
            </Button>
          </div>

          <div className="space-y-4 text-left p-6 rounded-xl border bg-card">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Join Team
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter a room ID to jump right into a session.
            </p>
            <form onSubmit={handleJoin} className="space-y-2">
              <Input 
                placeholder="Room ID..." 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
              <Button type="submit" variant="secondary" className="w-full">
                Join Board
              </Button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
