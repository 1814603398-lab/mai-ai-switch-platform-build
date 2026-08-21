use reqwest::{Client, Method};
use serde::Serialize;
use serde_json::{json, Value};

fn normalize_endpoint(value: &str) -> Result<String, String> {
    let value = value.trim().trim_end_matches('/');
    if value.is_empty() {
        return Err("New API 地址不能为空".to_string());
    }
    if !(value.starts_with("http://") || value.starts_with("https://")) {
        return Err("New API 地址必须以 http:// 或 https:// 开头".to_string());
    }
    Ok(value.to_string())
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("CC-Switch-SecDev/1.0")
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| format!("创建网络客户端失败: {error}"))
}

async fn request_json(
    method: Method,
    url: String,
    bearer: Option<&str>,
    body: Option<Value>,
) -> Result<Value, String> {
    let client = client()?;
    let mut request = client.request(method, url).header("Accept", "application/json");
    if let Some(token) = bearer.filter(|value| !value.is_empty()) {
        request = request.bearer_auth(token);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("无法连接 New API: {error}"))?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("New API 返回了无法解析的响应 ({status}): {error}"))?;

    if !status.is_success() {
        let message = payload
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("New API 请求失败");
        return Err(format!("{message} (HTTP {})", status.as_u16()));
    }
    Ok(payload)
}

#[derive(Debug, Clone, Serialize)]
pub struct NewApiConnection {
    pub endpoint: String,
    pub user: Value,
    pub access_token: String,
    pub token_type: String,
    pub session: Value,
}

fn auth_connection(payload: Value, endpoint: String) -> Result<NewApiConnection, String> {
    if payload.get("success") == Some(&Value::Bool(false)) {
        return Err(payload
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("登录失败")
            .to_string());
    }
    let data = payload
        .get("data")
        .cloned()
        .ok_or_else(|| "New API 登录响应缺少 data".to_string())?;
    let access_token = data
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "New API 登录响应缺少 access_token".to_string())?
        .to_string();
    Ok(NewApiConnection {
        endpoint,
        user: data.get("user").cloned().unwrap_or(Value::Null),
        access_token,
        token_type: data
            .get("token_type")
            .and_then(Value::as_str)
            .unwrap_or("Bearer")
            .to_string(),
        session: data.get("session").cloned().unwrap_or(Value::Null),
    })
}

#[tauri::command]
pub async fn new_api_login(
    endpoint: String,
    username: String,
    password: String,
) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::POST,
        format!("{endpoint}/api/user/login"),
        None,
        Some(json!({ "username": username.trim(), "password": password })),
    )
    .await
}

#[tauri::command]
pub async fn new_api_login_2fa(
    endpoint: String,
    flow_token: String,
    code: String,
) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::POST,
        format!("{endpoint}/api/user/login/2fa"),
        None,
        Some(json!({ "flow_token": flow_token, "code": code.trim() })),
    )
    .await
}

#[tauri::command]
pub async fn new_api_get_self(endpoint: String, access_token: String) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::GET,
        format!("{endpoint}/api/user/self"),
        Some(&access_token),
        None,
    )
    .await
}

#[tauri::command]
pub async fn new_api_generate_access_token(
    endpoint: String,
    access_token: String,
) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::GET,
        format!("{endpoint}/api/user/token"),
        Some(&access_token),
        None,
    )
    .await
}

#[tauri::command]
pub async fn new_api_list_tokens(endpoint: String, access_token: String) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::GET,
        format!("{endpoint}/api/token/?p=1&size=100"),
        Some(&access_token),
        None,
    )
    .await
}

#[tauri::command]
pub async fn new_api_reveal_token_key(
    endpoint: String,
    access_token: String,
    token_id: i64,
) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::POST,
        format!("{endpoint}/api/token/{token_id}/key"),
        Some(&access_token),
        None,
    )
    .await
}

#[tauri::command]
pub async fn new_api_get_models(endpoint: String, access_token: String) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::GET,
        format!("{endpoint}/api/user/models"),
        Some(&access_token),
        None,
    )
    .await
}

#[tauri::command]
pub async fn new_api_create_token(
    endpoint: String,
    access_token: String,
    name: String,
    group: String,
) -> Result<Value, String> {
    let endpoint = normalize_endpoint(&endpoint)?;
    request_json(
        Method::POST,
        format!("{endpoint}/api/token/"),
        Some(&access_token),
        Some(json!({
            "name": name.trim(),
            "group": group.trim(),
            "expired_time": -1,
            "remain_quota": 0,
            "unlimited_quota": true,
            "model_limits_enabled": false,
            "cross_group_retry": false
        })),
    )
    .await
}
