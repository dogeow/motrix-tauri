use std::{
    net::{IpAddr, SocketAddr, UdpSocket},
    sync::{
        atomic::{AtomicBool, AtomicU16, Ordering},
        Arc,
    },
    time::Duration,
};

use igd_next::{search_gateway, PortMappingProtocol, SearchOptions};

/// Router leases are renewed well before they lapse.
const LEASE_SECONDS: u32 = 3600;
const RENEW_INTERVAL: Duration = Duration::from_secs(1800);
const DESCRIPTION: &str = "Motrix BitTorrent";

#[derive(Default)]
pub struct UpnpState {
    active: Arc<AtomicBool>,
    /// Port currently being mapped, so a restart on a different port remaps.
    mapped: AtomicU16,
}

impl UpnpState {
    /// Map `port` (TCP for peers, UDP for DHT) until `stop` is called.
    /// Runs entirely on a background thread: SSDP discovery can block for
    /// seconds and must never sit on the UI thread.
    pub fn start(&self, port: u16) {
        if self.active.load(Ordering::SeqCst) {
            if self.mapped.load(Ordering::SeqCst) == port {
                return;
            }
            self.stop();
        }
        self.mapped.store(port, Ordering::SeqCst);
        self.active.store(true, Ordering::SeqCst);
        let active = self.active.clone();
        std::thread::spawn(move || {
            while active.load(Ordering::SeqCst) {
                match map_port(port) {
                    Ok(external) => {
                        println!("[upnp] mapped {port} -> {external}");
                    }
                    Err(error) => {
                        eprintln!("[upnp] mapping failed: {error}");
                    }
                }
                // Sleep in slices so stop() takes effect promptly.
                let mut slept = Duration::ZERO;
                while active.load(Ordering::SeqCst) && slept < RENEW_INTERVAL {
                    std::thread::sleep(Duration::from_secs(5));
                    slept += Duration::from_secs(5);
                }
            }
            let _ = unmap_port(port);
        });
    }

    pub fn stop(&self) {
        self.active.store(false, Ordering::SeqCst);
    }
}

/// The LAN address the router should forward to. Nothing is actually sent —
/// connecting a UDP socket just picks the route the OS would use.
fn local_ip() -> Result<IpAddr, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    socket
        .local_addr()
        .map(|addr| addr.ip())
        .map_err(|e| e.to_string())
}

fn map_port(port: u16) -> Result<String, String> {
    let gateway = search_gateway(SearchOptions {
        timeout: Some(Duration::from_secs(5)),
        ..Default::default()
    })
    .map_err(|e| e.to_string())?;

    let local = SocketAddr::new(local_ip()?, port);
    for protocol in [PortMappingProtocol::TCP, PortMappingProtocol::UDP] {
        gateway
            .add_port(protocol, port, local, LEASE_SECONDS, DESCRIPTION)
            .map_err(|e| e.to_string())?;
    }

    Ok(gateway
        .get_external_ip()
        .map(|ip| format!("{ip}:{port}"))
        .unwrap_or_else(|_| format!("*:{port}")))
}

fn unmap_port(port: u16) -> Result<(), String> {
    let gateway = search_gateway(SearchOptions {
        timeout: Some(Duration::from_secs(3)),
        ..Default::default()
    })
    .map_err(|e| e.to_string())?;
    for protocol in [PortMappingProtocol::TCP, PortMappingProtocol::UDP] {
        let _ = gateway.remove_port(protocol, port);
    }
    Ok(())
}
