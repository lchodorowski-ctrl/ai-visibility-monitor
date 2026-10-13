
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "citations": {
                  Row: {
                    "competitor_id": string | null,"domain": string,"id": string,"is_own": boolean,"project_id": string,"response_id": string,"title": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "competitor_id"?: string | null,"domain": string,"id"?: string,"is_own"?: boolean,"project_id": string,"response_id": string,"title"?: string | null,"url": string
                  }
                  Update: {
                    "competitor_id"?: string | null,"domain"?: string,"id"?: string,"is_own"?: boolean,"project_id"?: string,"response_id"?: string,"title"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "citations_competitor_id_fkey"
      columns: ["competitor_id"]
isOneToOne: false
      referencedRelation: "competitors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "citations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "citations_response_id_fkey"
      columns: ["response_id"]
isOneToOne: false
      referencedRelation: "responses"
      referencedColumns: ["id"]
    }
                  ]
                },"competitors": {
                  Row: {
                    "aliases": (string)[],"domains": (string)[],"id": string,"name": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"domains"?: (string)[],"id"?: string,"name": string,"project_id": string
                  }
                  Update: {
                    "aliases"?: (string)[],"domains"?: (string)[],"id"?: string,"name"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitors_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_metrics": {
                  Row: {
                    "avg_position": number | null,"citation_rate": number,"computed_at": string,"date": string,"engine_id": string | null,"id": string,"project_id": string,"prompt_id": string | null,"responses_count": number,"score": number,"share_of_voice": number,"visibility_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_position"?: number | null,"citation_rate"?: number,"computed_at"?: string,"date": string,"engine_id"?: string | null,"id"?: string,"project_id": string,"prompt_id"?: string | null,"responses_count"?: number,"score"?: number,"share_of_voice"?: number,"visibility_rate"?: number
                  }
                  Update: {
                    "avg_position"?: number | null,"citation_rate"?: number,"computed_at"?: string,"date"?: string,"engine_id"?: string | null,"id"?: string,"project_id"?: string,"prompt_id"?: string | null,"responses_count"?: number,"score"?: number,"share_of_voice"?: number,"visibility_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_metrics_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_metrics_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "org_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "org_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "org_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"mentions": {
                  Row: {
                    "brand_kind": string,"brand_name": string,"char_index": number,"competitor_id": string | null,"id": string,"position": number,"project_id": string,"response_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_kind": string,"brand_name": string,"char_index": number,"competitor_id"?: string | null,"id"?: string,"position": number,"project_id": string,"response_id": string
                  }
                  Update: {
                    "brand_kind"?: string,"brand_name"?: string,"char_index"?: number,"competitor_id"?: string | null,"id"?: string,"position"?: number,"project_id"?: string,"response_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mentions_competitor_id_fkey"
      columns: ["competitor_id"]
isOneToOne: false
      referencedRelation: "competitors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mentions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mentions_response_id_fkey"
      columns: ["response_id"]
isOneToOne: false
      referencedRelation: "responses"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_engines": {
                  Row: {
                    "enabled": boolean,"engine_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"engine_id": string,"project_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"engine_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_engines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "brand_aliases": (string)[],"brand_name": string,"country": string,"created_at": string,"domains": (string)[],"facts": NonNullable<Json>,"id": string,"locale": string,"low_visibility_threshold": number,"monthly_budget_usd": number,"name": string,"org_id": string,"schedule": string,"site_url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_aliases"?: (string)[],"brand_name": string,"country"?: string,"created_at"?: string,"domains"?: (string)[],"facts"?: NonNullable<Json>,"id"?: string,"locale"?: string,"low_visibility_threshold"?: number,"monthly_budget_usd"?: number,"name": string,"org_id": string,"schedule"?: string,"site_url"?: string
                  }
                  Update: {
                    "brand_aliases"?: (string)[],"brand_name"?: string,"country"?: string,"created_at"?: string,"domains"?: (string)[],"facts"?: NonNullable<Json>,"id"?: string,"locale"?: string,"low_visibility_threshold"?: number,"monthly_budget_usd"?: number,"name"?: string,"org_id"?: string,"schedule"?: string,"site_url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"prompts": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"intent": string,"is_key": boolean,"project_id": string,"text": string,"topic_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"intent"?: string,"is_key"?: boolean,"project_id": string,"text": string,"topic_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"intent"?: string,"is_key"?: boolean,"project_id"?: string,"text"?: string,"topic_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prompts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prompts_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendations": {
                  Row: {
                    "action_steps": NonNullable<Json>,"created_at": string,"effort": number,"evidence": NonNullable<Json>,"fingerprint": string,"id": string,"impact": number,"priority": number | null,"project_id": string,"prompt_id": string | null,"run_id": string | null,"status": string,"suggested_outline": Json | null,"summary": string,"target_url": string | null,"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_steps"?: NonNullable<Json>,"created_at"?: string,"effort": number,"evidence"?: NonNullable<Json>,"fingerprint": string,"id"?: string,"impact": number,"priority"?: never,"project_id": string,"prompt_id"?: string | null,"run_id"?: string | null,"status"?: string,"suggested_outline"?: Json | null,"summary": string,"target_url"?: string | null,"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "action_steps"?: NonNullable<Json>,"created_at"?: string,"effort"?: number,"evidence"?: NonNullable<Json>,"fingerprint"?: string,"id"?: string,"impact"?: number,"priority"?: never,"project_id"?: string,"prompt_id"?: string | null,"run_id"?: string | null,"status"?: string,"suggested_outline"?: Json | null,"summary"?: string,"target_url"?: string | null,"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendations_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendations_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"responses": {
                  Row: {
                    "citations": NonNullable<Json>,"cost_usd": number,"created_at": string,"engine_id": string,"error": string | null,"id": string,"model": string | null,"no_answer": boolean,"project_id": string,"prompt_id": string,"raw": Json | null,"run_id": string,"sample_idx": number,"sentiment": string | null,"sentiment_summary": string | null,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "citations"?: NonNullable<Json>,"cost_usd"?: number,"created_at"?: string,"engine_id": string,"error"?: string | null,"id"?: string,"model"?: string | null,"no_answer"?: boolean,"project_id": string,"prompt_id": string,"raw"?: Json | null,"run_id": string,"sample_idx"?: number,"sentiment"?: string | null,"sentiment_summary"?: string | null,"text"?: string
                  }
                  Update: {
                    "citations"?: NonNullable<Json>,"cost_usd"?: number,"created_at"?: string,"engine_id"?: string,"error"?: string | null,"id"?: string,"model"?: string | null,"no_answer"?: boolean,"project_id"?: string,"prompt_id"?: string,"raw"?: Json | null,"run_id"?: string,"sample_idx"?: number,"sentiment"?: string | null,"sentiment_summary"?: string | null,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "responses_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "responses_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "responses_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"runs": {
                  Row: {
                    "cost_usd": number,"error": string | null,"finished_at": string | null,"id": string,"project_id": string,"queries_failed": number,"queries_total": number,"recommendations_cost_usd": number,"started_at": string,"status": string,"trigger_source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"project_id": string,"queries_failed"?: number,"queries_total"?: number,"recommendations_cost_usd"?: number,"started_at"?: string,"status"?: string,"trigger_source"?: string
                  }
                  Update: {
                    "cost_usd"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"project_id"?: string,"queries_failed"?: number,"queries_total"?: number,"recommendations_cost_usd"?: number,"started_at"?: string,"status"?: string,"trigger_source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "runs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"site_pages": {
                  Row: {
                    "description": string | null,"excerpt": string | null,"fetched_at": string,"h1": string | null,"id": string,"path": string,"project_id": string,"status": number,"title": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"h1"?: string | null,"id"?: string,"path": string,"project_id": string,"status"?: number,"title"?: string | null,"url": string
                  }
                  Update: {
                    "description"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"h1"?: string | null,"id"?: string,"path"?: string,"project_id"?: string,"status"?: number,"title"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_pages_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"topics": {
                  Row: {
                    "id": string,"name": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"project_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_org_member":
{ Args: { "org": string }; Returns: boolean
                           },
"project_org":
{ Args: { "p": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
