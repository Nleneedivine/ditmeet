import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GoldButton } from "@/components/brand/GoldButton";
import { supabase } from "@/integrations/supabase/client";
import { createDailyRoom } from "@/lib/daily.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hostId: string;
  onCreated?: () => void;
}

export function ScheduleDialog({ open, onOpenChange, hostId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle(""); setDescription(""); setDate(""); setTime("");
  };

  const submit = async () => {
    if (!title.trim() || !date || !time) {
      toast.error("Title, date, and time are required");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error("Invalid date/time");
      return;
    }
    setSaving(true);
    try {
      const room = await createDailyRoom({
        data: { prefix: title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "ditm", expiresInMinutes: 60 * 6 },
      });
      const { error } = await supabase.from("meetings").insert({
        host_id: hostId,
        title: title.trim(),
        description: description.trim() || null,
        room_name: room.name,
        room_url: room.url,
        scheduled_at: scheduledAt.toISOString(),
        status: "scheduled",
      });
      if (error) throw error;
      toast.success("Meeting scheduled");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card-velvet border-gold sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-gold text-2xl">Schedule a meeting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Anniversary keynote" maxLength={120} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional agenda…" rows={3} maxLength={500} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <GoldButton variant="ghost" onClick={() => onOpenChange(false)}>Cancel</GoldButton>
          <GoldButton onClick={submit} disabled={saving}>{saving ? "Creating…" : "Schedule"}</GoldButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
