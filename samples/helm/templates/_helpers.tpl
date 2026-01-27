{{/*
Expand the name of the chart.
*/}}
{{- define "argo-workflow-sample.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "argo-workflow-sample.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "argo-workflow-sample.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "argo-workflow-sample.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Generate ConfigMap name
*/}}
{{- define "argo-workflow-sample.configMapName" -}}
{{- printf "%s-config" (include "argo-workflow-sample.fullname" .) }}
{{- end }}

{{/*
Generate Secret name
*/}}
{{- define "argo-workflow-sample.secretName" -}}
{{- printf "%s-secrets" (include "argo-workflow-sample.fullname" .) }}
{{- end }}

{{/*
Generate WorkflowTemplate name
*/}}
{{- define "argo-workflow-sample.workflowTemplateName" -}}
{{- printf "%s-templates" (include "argo-workflow-sample.fullname" .) }}
{{- end }}

{{/*
Format environment value with uppercase and prefix
*/}}
{{- define "argo-workflow-sample.envPrefix" -}}
{{- .Values.app.environment | upper | printf "%s_" }}
{{- end }}
