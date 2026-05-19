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

   5  cortex-rules-configmap            (rule groups for Cortex ruler)
   6  cortex-rules-init-script          (init-cortex-rules.py)
  10  cortex-rules-init                 (Job — POSTs rules to Cortex Ruler API)
  10  init-dashboards                   (Job — provisions OSD index patterns + datasources)
  11  stack-monitors-init-script        (init-stack-monitors.py)
  11  otel-demo-monitors-init-script    (init-otel-demo-monitors.py)
  15  stack-monitors-init               (Job — creates OSD alerting monitors for stack)
  15  otel-demo-monitors-init           (Job — creates OSD alerting monitors for otel-demo)

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
