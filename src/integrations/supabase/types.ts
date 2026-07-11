export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          created_at: string
          id: string
          name: string
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          accuracy_m: number | null
          captured_at: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          match_distance: number | null
          method: string
          storage_path: string | null
          supervisor_id: string | null
          work_date: string
          worker_id: string
        }
        Insert: {
          accuracy_m?: number | null
          captured_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          latitude?: number | null
          longitude?: number | null
          match_distance?: number | null
          method?: string
          storage_path?: string | null
          supervisor_id?: string | null
          work_date?: string
          worker_id: string
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          match_distance?: number | null
          method?: string
          storage_path?: string | null
          supervisor_id?: string | null
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      contractors: {
        Row: {
          aadhar: string | null
          created_at: string
          employee_type_id: string | null
          gender: string | null
          id: string
          mobile: string | null
          name: string
          phone: string | null
          photo_url: string | null
          scrum_id: string | null
        }
        Insert: {
          aadhar?: string | null
          created_at?: string
          employee_type_id?: string | null
          gender?: string | null
          id?: string
          mobile?: string | null
          name: string
          phone?: string | null
          photo_url?: string | null
          scrum_id?: string | null
        }
        Update: {
          aadhar?: string | null
          created_at?: string
          employee_type_id?: string | null
          gender?: string | null
          id?: string
          mobile?: string | null
          name?: string
          phone?: string | null
          photo_url?: string | null
          scrum_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_employee_type_id_fkey"
            columns: ["employee_type_id"]
            isOneToOne: false
            referencedRelation: "employee_types"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_log_edits: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          daily_log_id: string | null
          edited_at: string
          edited_by: string | null
          id: string
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          daily_log_id?: string | null
          edited_at?: string
          edited_by?: string | null
          id?: string
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          daily_log_id?: string | null
          edited_at?: string
          edited_by?: string | null
          id?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          contractor_id: string | null
          contractor_share: number
          date: string
          hours: number
          id: string
          line_item_id: string | null
          released_at: string
          remark: string
          supervisor_id: string | null
          total_wages: number
          wage_scale: number
          work_done: number
          worker_id: string | null
          zero_reason: string | null
        }
        Insert: {
          contractor_id?: string | null
          contractor_share?: number
          date?: string
          hours: number
          id?: string
          line_item_id?: string | null
          released_at?: string
          remark?: string
          supervisor_id?: string | null
          total_wages: number
          wage_scale: number
          work_done?: number
          worker_id?: string | null
          zero_reason?: string | null
        }
        Update: {
          contractor_id?: string | null
          contractor_share?: number
          date?: string
          hours?: number
          id?: string
          line_item_id?: string | null
          released_at?: string
          remark?: string
          supervisor_id?: string | null
          total_wages?: number
          wage_scale?: number
          work_done?: number
          worker_id?: string | null
          zero_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      designations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      employee_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      item_catalog: {
        Row: {
          created_at: string
          default_rate: number | null
          default_uom: string | null
          description: string
          id: string
        }
        Insert: {
          created_at?: string
          default_rate?: number | null
          default_uom?: string | null
          description: string
          id?: string
        }
        Update: {
          created_at?: string
          default_rate?: number | null
          default_uom?: string | null
          description?: string
          id?: string
        }
        Relationships: []
      }
      line_item_assignments: {
        Row: {
          area_id: string | null
          assigned_date: string
          assignment_no: string | null
          created_at: string
          id: string
          legacy_assignment_no: string | null
          line_item_id: string | null
          parent_assignment_no: string | null
          quantity: number | null
          released_at: string | null
          released_by: string | null
          replaced_by_supervisor_id: string | null
          site_assignment_id: string | null
          sub_area_id: string | null
          supervisor_id: string
        }
        Insert: {
          area_id?: string | null
          assigned_date?: string
          assignment_no?: string | null
          created_at?: string
          id?: string
          legacy_assignment_no?: string | null
          line_item_id?: string | null
          parent_assignment_no?: string | null
          quantity?: number | null
          released_at?: string | null
          released_by?: string | null
          replaced_by_supervisor_id?: string | null
          site_assignment_id?: string | null
          sub_area_id?: string | null
          supervisor_id: string
        }
        Update: {
          area_id?: string | null
          assigned_date?: string
          assignment_no?: string | null
          created_at?: string
          id?: string
          legacy_assignment_no?: string | null
          line_item_id?: string | null
          parent_assignment_no?: string | null
          quantity?: number | null
          released_at?: string | null
          released_by?: string | null
          replaced_by_supervisor_id?: string | null
          site_assignment_id?: string | null
          sub_area_id?: string | null
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lia_line_item_fk"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lia_supervisor_fk"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_item_assignments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_item_assignments_site_assignment_id_fkey"
            columns: ["site_assignment_id"]
            isOneToOne: false
            referencedRelation: "site_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_item_assignments_sub_area_id_fkey"
            columns: ["sub_area_id"]
            isOneToOne: false
            referencedRelation: "sub_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          amendment_serial: number
          area_id: string | null
          created_at: string
          description: string
          id: string
          po_id: string
          quantity: number
          source_quotation_id: string | null
          source_quotation_item_id: string | null
          supervisor_id: string | null
          uom: string
        }
        Insert: {
          amendment_serial?: number
          area_id?: string | null
          created_at?: string
          description: string
          id?: string
          po_id: string
          quantity?: number
          source_quotation_id?: string | null
          source_quotation_item_id?: string | null
          supervisor_id?: string | null
          uom: string
        }
        Update: {
          amendment_serial?: number
          area_id?: string | null
          created_at?: string
          description?: string
          id?: string
          po_id?: string
          quantity?: number
          source_quotation_id?: string | null
          source_quotation_item_id?: string | null
          supervisor_id?: string | null
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_source_quotation_id_fkey"
            columns: ["source_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_source_quotation_item_id_fkey"
            columns: ["source_quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          full_name: string
          mobile: string
          status: Database["public"]["Enums"]["profile_status"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          full_name?: string
          mobile?: string
          status?: Database["public"]["Enums"]["profile_status"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          full_name?: string
          mobile?: string
          status?: Database["public"]["Enums"]["profile_status"]
          user_id?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          area_id: string | null
          client_id: string | null
          client_name: string
          created_at: string
          doc_date: string
          id: string
          po_number: string | null
          quotation_id: string | null
          site: string
          site_id: string | null
        }
        Insert: {
          area_id?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          doc_date?: string
          id?: string
          po_number?: string | null
          quotation_id?: string | null
          site: string
          site_id?: string | null
        }
        Update: {
          area_id?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          doc_date?: string
          id?: string
          po_number?: string | null
          quotation_id?: string | null
          site?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          quotation_id: string
          rate: number
          uom: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          quantity?: number
          quotation_id: string
          rate?: number
          uom: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quotation_id?: string
          rate?: number
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          amendment_serial: number | null
          area_id: string | null
          client_id: string | null
          client_name: string
          created_at: string
          doc_date: string
          id: string
          merged_po_id: string | null
          quotation_no: string | null
          site: string
          site_id: string | null
          status: string
        }
        Insert: {
          amendment_serial?: number | null
          area_id?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          doc_date?: string
          id?: string
          merged_po_id?: string | null
          quotation_no?: string | null
          site: string
          site_id?: string | null
          status?: string
        }
        Update: {
          amendment_serial?: number | null
          area_id?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          doc_date?: string
          id?: string
          merged_po_id?: string | null
          quotation_no?: string | null
          site?: string
          site_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_merged_po_id_fkey"
            columns: ["merged_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_assignment_items: {
        Row: {
          created_at: string
          id: string
          po_line_item_id: string
          quantity: number
          site_assignment_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          po_line_item_id: string
          quantity: number
          site_assignment_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          po_line_item_id?: string
          quantity?: number
          site_assignment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assignment_items_po_line_item_id_fkey"
            columns: ["po_line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignment_items_site_assignment_id_fkey"
            columns: ["site_assignment_id"]
            isOneToOne: false
            referencedRelation: "site_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      site_assignments: {
        Row: {
          area_id: string | null
          assignment_no: string | null
          created_at: string
          id: string
          notes: string | null
          po_id: string
          primary_supervisor_id: string | null
          site_id: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          assignment_no?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          po_id: string
          primary_supervisor_id?: string | null
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          assignment_no?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          po_id?: string
          primary_supervisor_id?: string | null
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assignments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_primary_supervisor_id_fkey"
            columns: ["primary_supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          client_id: string | null
          created_at: string
          id: string
          name: string
          po_id: string | null
        }
        Insert: {
          address?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          name: string
          po_id?: string | null
        }
        Update: {
          address?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          po_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_areas: {
        Row: {
          area_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_daily_roster: {
        Row: {
          created_at: string
          id: string
          release_reason: string | null
          released_at: string | null
          supervisor_id: string
          work_date: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          release_reason?: string | null
          released_at?: string | null
          supervisor_id: string
          work_date?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          release_reason?: string | null
          released_at?: string | null
          supervisor_id?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sup_daily_roster_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_daily_roster_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_site_remarks: {
        Row: {
          area_id: string
          created_at: string
          id: string
          remark: string
          supervisor_id: string
          updated_at: string
          work_date: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          remark?: string
          supervisor_id: string
          updated_at?: string
          work_date?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          remark?: string
          supervisor_id?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sup_site_remarks_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_site_remarks_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisors: {
        Row: {
          aadhar: string | null
          created_at: string
          employee_type_id: string | null
          gender: string | null
          id: string
          mobile: string | null
          name: string
          photo_url: string | null
          scrum_id: string | null
          user_id: string | null
        }
        Insert: {
          aadhar?: string | null
          created_at?: string
          employee_type_id?: string | null
          gender?: string | null
          id?: string
          mobile?: string | null
          name: string
          photo_url?: string | null
          scrum_id?: string | null
          user_id?: string | null
        }
        Update: {
          aadhar?: string | null
          created_at?: string
          employee_type_id?: string | null
          gender?: string | null
          id?: string
          mobile?: string | null
          name?: string
          photo_url?: string | null
          scrum_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supervisors_employee_type_id_fkey"
            columns: ["employee_type_id"]
            isOneToOne: false
            referencedRelation: "employee_types"
            referencedColumns: ["id"]
          },
        ]
      }
      uoms: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_photos: {
        Row: {
          accuracy_m: number | null
          captured_at: string
          created_at: string
          id: string
          kind: string
          latitude: number | null
          line_item_id: string | null
          longitude: number | null
          site_id: string | null
          storage_path: string
          supervisor_id: string
          work_date: string
        }
        Insert: {
          accuracy_m?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          kind: string
          latitude?: number | null
          line_item_id?: string | null
          longitude?: number | null
          site_id?: string | null
          storage_path: string
          supervisor_id: string
          work_date?: string
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          kind?: string
          latitude?: number | null
          line_item_id?: string | null
          longitude?: number | null
          site_id?: string | null
          storage_path?: string
          supervisor_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_photos_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_photos_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_photos_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_face_enrollments: {
        Row: {
          created_at: string
          created_by: string | null
          descriptor: Json
          id: string
          source: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descriptor: Json
          id?: string
          source?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descriptor?: Json
          id?: string
          source?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_face_enrollments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          aadhar: string | null
          contractor_id: string | null
          contractor_share_amount: number
          created_at: string
          current_area_id: string | null
          current_line_item_id: string | null
          current_supervisor_id: string | null
          daily_rate: number
          designation: string
          employee_type_id: string | null
          gender: string | null
          id: string
          is_busy: boolean
          mobile: string | null
          name: string
          photo_url: string | null
          scrum_id: string | null
        }
        Insert: {
          aadhar?: string | null
          contractor_id?: string | null
          contractor_share_amount?: number
          created_at?: string
          current_area_id?: string | null
          current_line_item_id?: string | null
          current_supervisor_id?: string | null
          daily_rate?: number
          designation: string
          employee_type_id?: string | null
          gender?: string | null
          id?: string
          is_busy?: boolean
          mobile?: string | null
          name: string
          photo_url?: string | null
          scrum_id?: string | null
        }
        Update: {
          aadhar?: string | null
          contractor_id?: string | null
          contractor_share_amount?: number
          created_at?: string
          current_area_id?: string | null
          current_line_item_id?: string | null
          current_supervisor_id?: string | null
          daily_rate?: number
          designation?: string
          employee_type_id?: string | null
          gender?: string | null
          id?: string
          is_busy?: boolean
          mobile?: string | null
          name?: string
          photo_url?: string | null
          scrum_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_current_area_id_fkey"
            columns: ["current_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_current_supervisor_id_fkey"
            columns: ["current_supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_employee_type_id_fkey"
            columns: ["employee_type_id"]
            isOneToOne: false
            referencedRelation: "employee_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_supervisor_to_site: {
        Args: {
          _assigned_date?: string
          _site_assignment_id: string
          _supervisor_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_supervisor: { Args: { _user_id: string }; Returns: boolean }
      release_supervisor_from_site: {
        Args: {
          _area_id: string
          _replacement_id?: string
          _supervisor_id: string
        }
        Returns: undefined
      }
      set_primary_supervisor: {
        Args: { _site_assignment_id: string; _supervisor_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "supervisor"
      profile_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "supervisor"],
      profile_status: ["pending", "approved", "rejected"],
    },
  },
} as const
