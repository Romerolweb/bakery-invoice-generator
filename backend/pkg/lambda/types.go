package lambda

// Request represents a generic HTTP request for serverless functions
type Request struct {
	Method      string            `json:"method"`
	Path        string            `json:"path"`
	Headers     map[string]string `json:"headers"`
	QueryParams map[string]string `json:"query_params"`
	Body        []byte            `json:"body"`
	PathParams  map[string]string `json:"path_params"`
}

// Response represents a generic HTTP response for serverless functions
type Response struct {
	StatusCode int               `json:"status_code"`
	Headers    map[string]string `json:"headers"`
	Body       []byte            `json:"body"`
}

// HandlerFunc is a framework-agnostic handler interface
type HandlerFunc func(req *Request) (*Response, error)
