'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { PromptTemplate, TemplateVariable } from '@/lib/types';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, X, Plus, Trash2, Eye, Loader2 } from 'lucide-react';

interface PromptTemplateEditorProps {
  template?: PromptTemplate;
  onSave: (template: PromptTemplate) => void;
  onCancel: () => void;
}

const EMPTY_VARIABLE: TemplateVariable = { name: '', type: 'string', required: false };

export default function PromptTemplateEditor({ template, onSave, onCancel }: PromptTemplateEditorProps) {
  const t = useTranslations('promptTemplates');
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [templateText, setTemplateText] = useState(template?.template ?? '');
  const [variables, setVariables] = useState<TemplateVariable[]>(template?.variables ?? []);
  const [isPublic, setIsPublic] = useState(template?.isPublic ?? false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!template?.id;

  // Build sample values for preview
  const sampleValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const v of variables) {
      if (v.default) {
        values[v.name] = v.default;
      } else if (v.type === 'number') {
        values[v.name] = '42';
      } else if (v.type === 'boolean') {
        values[v.name] = 'true';
      } else if (v.type === 'select' && v.options?.length) {
        values[v.name] = v.options[0];
      } else {
        values[v.name] = `<${v.name}>`;
      }
    }
    return values;
  }, [variables]);

  // Render preview by replacing {{variable}} placeholders
  const renderedPreview = useMemo(() => {
    let text = templateText;
    for (const [key, val] of Object.entries(sampleValues)) {
      text = text.replaceAll(`{{${key}}}`, val);
    }
    return text;
  }, [templateText, sampleValues]);

  // Detect variables used in template but not yet defined
  const detectedVars = useMemo(() => {
    const matches = templateText.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    const names = [...new Set(matches.map((m) => m.slice(2, -2)))];
    return names.filter((n) => !variables.some((v) => v.name === n));
  }, [templateText, variables]);

  const updateVariable = useCallback((index: number, patch: Partial<TemplateVariable>) => {
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }, []);

  const removeVariable = useCallback((index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addVariable = useCallback((name?: string) => {
    setVariables((prev) => [...prev, { ...EMPTY_VARIABLE, name: name ?? '' }]);
  }, []);

  async function handleSave() {
    if (!name.trim() || !templateText.trim()) {
      setError(t('nameAndTemplateRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let saved: PromptTemplate;
      const data = {
        name: name.trim(),
        template: templateText,
        description: description.trim() || undefined,
        variables: variables.filter((v) => v.name.trim()),
        is_public: isPublic,
      };
      if (isEditing) {
        saved = await api.updatePromptTemplate(template!.id, data);
      } else {
        saved = await api.createPromptTemplate(data);
      }
      onSave(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-1 border border-border-default rounded-lg p-5 space-y-5">
      {/* Name + visibility */}
      <div className="flex items-end gap-4">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-text-secondary">{t('templateName')}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekly Summary Prompt"
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          <Label className="text-xs text-text-secondary">{t('public')}</Label>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs text-text-secondary">{t('description')}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this template do?"
          className="min-h-[60px]"
        />
      </div>

      {/* Template body */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-text-secondary">
            {t('template')}
          </Label>
          <span className="text-[10px] text-text-secondary">
            {t('variableSyntaxHint')}
          </span>
        </div>
        <Textarea
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          placeholder="You are a helpful assistant. Summarize the following topic: {{topic}}"
          className="min-h-[140px] font-mono text-xs"
        />
        {/* Detected but undefined variables */}
        {detectedVars.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-text-secondary">{t('detected')}</span>
            {detectedVars.map((v) => (
              <button
                key={v}
                onClick={() => addVariable(v)}
                className="inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover cursor-pointer"
              >
                <Plus className="h-2.5 w-2.5" />
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Variables section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-text-secondary">{t('variables')} ({variables.length})</Label>
          <Button size="sm" variant="ghost" onClick={() => addVariable()}>
            <Plus className="h-3 w-3" />
            {t('addVariable')}
          </Button>
        </div>

        {variables.length === 0 && (
          <p className="text-xs text-text-secondary py-2">
            {t('noVariablesDefined')}
          </p>
        )}

        {variables.map((v, i) => (
          <div key={i} className="flex items-start gap-2 bg-surface-0 border border-border rounded-md p-3">
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-text-secondary">{t('name')}</Label>
                <Input
                  value={v.name}
                  onChange={(e) => updateVariable(i, { name: e.target.value })}
                  placeholder="variable_name"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-text-secondary">{t('type')}</Label>
                <Select value={v.type} onValueChange={(val) => updateVariable(i, { type: val as TemplateVariable['type'] })}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">{t('typeString')}</SelectItem>
                    <SelectItem value="number">{t('typeNumber')}</SelectItem>
                    <SelectItem value="boolean">{t('typeBoolean')}</SelectItem>
                    <SelectItem value="select">{t('typeSelect')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-text-secondary">{t('default')}</Label>
                <Input
                  value={v.default ?? ''}
                  onChange={(e) => updateVariable(i, { default: e.target.value || undefined })}
                  placeholder="default value"
                  className="text-xs"
                />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={v.required ?? false}
                    onCheckedChange={(checked) => updateVariable(i, { required: checked })}
                  />
                  <span className="text-[10px] text-text-secondary">{t('required')}</span>
                </div>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0 mt-5 h-7 w-7 text-text-secondary hover:text-red-400"
              onClick={() => removeVariable(i)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {/* Select options (shown when a select-type variable exists) */}
        {variables.some((v) => v.type === 'select') && (
          <div className="space-y-2">
            {variables.map((v, i) =>
              v.type === 'select' ? (
                <div key={`opts-${i}`} className="bg-surface-0 border border-border rounded-md p-3 space-y-1.5">
                  <Label className="text-[10px] text-text-secondary">
                    {t('optionsFor', { name: v.name || 'unnamed' })}
                  </Label>
                  <Input
                    value={v.options?.join(', ') ?? ''}
                    onChange={(e) =>
                      updateVariable(i, {
                        options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="option1, option2, option3"
                    className="text-xs"
                  />
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <button
          onClick={() => setShowPreview((p) => !p)}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <Eye className="h-3 w-3" />
          {showPreview ? t('hidePreview') : t('showPreview')}
        </button>
        {showPreview && (
          <div className="space-y-2">
            {variables.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {variables.filter((v) => v.name).map((v) => (
                  <Badge key={v.name} variant="outline" className="text-[10px]">
                    {v.name} = {sampleValues[v.name] ?? ''}
                  </Badge>
                ))}
              </div>
            )}
            <pre className="bg-surface-0 border border-border rounded-md p-3 text-xs text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto">
              {renderedPreview}
            </pre>
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {isEditing ? t('updateTemplate') : t('createTemplate')}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-3 w-3" />
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
