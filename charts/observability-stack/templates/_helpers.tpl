{{/*
Expand the name of the chart.
*/}}
{{- define "observability-stack.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "observability-stack.fullname" -}}
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
Helm post-install/post-upgrade hook ordering
--------------------------------------------
Init scripts must mount before the Job that consumes them, so script
ConfigMaps run at lower weights than their corresponding Jobs. When
adding a new init Job, pick a weight that doesn't collide with this
list (or, easier, leave gaps of 5 so future inserts don't shuffle):

   5  cortex-rules-configmap                          (rule groups for Cortex ruler)
  10  init-dashboards                                 (Job — provisions OSD index patterns + datasources)
  11  alerting-rules-monitors-init-script             (init-cortex-rules.py + init-stack-monitors.py)
  11  otel-demo-alerting-rules-monitors-init-script   (init-cortex-rules.py + init-otel-demo-monitors.py)
  15  alerting-rules-monitors-init                    (Job — Cortex stack rules + OSD stack monitors)
  15  otel-demo-alerting-rules-monitors-init          (Job — Cortex otel-demo rules + OSD otel-demo monitors)

The GenAI evaluation index init is NOT a hook either: it is an init container on the Data
Prepper pod (genai-evaluation-index-init, see genai-evaluation-index-configmap.yaml), so the
write alias exists before Data Prepper's first write. Its ConfigMaps are regular resources.

The anomaly-detection init Jobs are deliberately NOT hooks (they can run
~40 minutes on a fresh install); see anomaly-detection-init-job.yaml.

Update this table when you add or move a hook so the next person can
slot in without re-deriving the order.
*/}}

{{/*
Common labels
*/}}
{{- define "observability-stack.labels" -}}
helm.sh/chart: {{ include "observability-stack.name" . }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: observability-stack
{{- end }}

{{/*
ISM retention in days for the init jobs (ISM_RETENTION_DAYS). Defaults to 7 when the key is
absent and honors an explicit 0, which keeps indices (Helm's `default` treats 0 as empty).
*/}}
{{- define "observability-stack.ismRetentionDays" -}}
{{- if hasKey .Values "ismRetentionDays" }}{{ .Values.ismRetentionDays | int }}{{ else }}7{{ end }}
{{- end }}
