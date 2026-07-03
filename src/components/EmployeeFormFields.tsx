import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMaster, createMaster, toOptions, useInvalidateMaster } from "@/lib/masters";
import { uploadEmployeePhoto, getPhotoUrl, initialsOf } from "@/lib/employeePhoto";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type EmpFields = {
  name: string;
  scrum_id: string;
  mobile: string;
  aadhar: string;
  gender: string;
  employee_type_id: string;
  photo_url: string; // storage path or empty
};

export const blankEmp: EmpFields = {
  name: "", scrum_id: "", mobile: "", aadhar: "", gender: "", employee_type_id: "", photo_url: "",
};

export function validateEmp(e: EmpFields): string | null {
  if (!e.name.trim()) return "Name required";
  if (!e.scrum_id.trim()) return "Scrum ID required";
  if (e.mobile && !/^[0-9]{10}$/.test(e.mobile)) return "Mobile must be 10 digits";
  if (!/^[0-9]{12}$/.test(e.aadhar)) return "Aadhar must be 12 digits";
  if (!e.employee_type_id) return "Employee Type required";
  return null;
}

const digitsOnly = (s: string, max: number) => s.replace(/\D/g, "").slice(0, max);

type Props = {
  value: EmpFields;
  onChange: (v: EmpFields) => void;
  defaultType?: string; // e.g. "Worker"
  hideType?: boolean;
  photoRole?: "worker" | "supervisor" | "contractor";
};

export function EmployeeFormFields({ value, onChange, defaultType, hideType, photoRole }: Props) {
  const { data: types = [] } = useMaster<{ id: string; name: string }>("employee_types", "id,name");
  const invalidate = useInvalidateMaster();

  const set = (p: Partial<EmpFields>) => onChange({ ...value, ...p });

  // Auto-select default type if not set
  useEffect(() => {
    if (!value.employee_type_id && defaultType && types.length) {
      const t = types.find((x) => x.name === defaultType);
      if (t) onChange({ ...value, employee_type_id: t.id });
    }
  }, [defaultType, types, value.employee_type_id]);

  // Photo preview URL
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getPhotoUrl(value.photo_url).then((u) => { if (alive) setPreviewUrl(u); });
    return () => { alive = false; };
  }, [value.photo_url]);

  const handleFile = async (f: File | null | undefined) => {
    if (!f || !photoRole) return;
    setUploading(true);
    try {
      const path = await uploadEmployeePhoto(photoRole, f);
      set({ photo_url: path });
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {photoRole && (
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center text-lg text-muted-foreground shrink-0">
            {previewUrl
              ? <img src={previewUrl} alt="photo" className="w-full h-full object-cover" />
              : <span>{value.name ? initialsOf(value.name) : "?"}</span>}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => cameraRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Take photo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4" />
                Upload
              </Button>
              {value.photo_url && (
                <Button type="button" size="sm" variant="ghost" onClick={() => set({ photo_url: "" })}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">Passport-size photo (auto-cropped to square)</div>
            <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Name *</div>
        <Input value={value.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Scrum ID *</div>
          <Input value={value.scrum_id} onChange={(e) => set({ scrum_id: e.target.value })} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Mobile (10 digits)</div>
          <Input inputMode="numeric" maxLength={10} value={value.mobile}
            onChange={(e) => set({ mobile: digitsOnly(e.target.value, 10) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Aadhar (12 digits) *</div>
          <Input inputMode="numeric" maxLength={12} value={value.aadhar}
            onChange={(e) => set({ aadhar: digitsOnly(e.target.value, 12) })} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Gender</div>
          <Select value={value.gender || "unspecified"} onValueChange={(v) => set({ gender: v === "unspecified" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unspecified">—</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {!hideType && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Employee Type *</div>
          <SearchableSelect
            value={value.employee_type_id}
            onChange={(v) => set({ employee_type_id: v })}
            options={toOptions(types)}
            placeholder="Pick type"
            onCreate={async (text) => {
              const opt = await createMaster("employee_types", { name: text });
              if (opt) invalidate("employee_types");
              return opt;
            }}
          />
        </div>
      )}
    </div>
  );
}
