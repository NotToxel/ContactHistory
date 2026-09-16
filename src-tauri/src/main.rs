#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 5 && args[1] == "import-fixture" {
        if let Err(error) =
            contact_history::import_fixture(std::path::Path::new(&args[2]), &args[3], &args[4])
        {
            eprintln!("Fixture import failed: {error:#}");
            std::process::exit(1);
        }
    } else if args.len() == 6 && args[1] == "export" {
        let sequence = args[3]
            .parse::<i64>()
            .expect("capture sequence must be an integer");
        if let Err(error) = contact_history::export_headless(
            &args[2],
            sequence,
            &args[4],
            std::path::Path::new(&args[5]),
        ) {
            eprintln!("Export failed: {error:#}");
            std::process::exit(1);
        }
    } else if args.len() == 4 && args[1] == "backup" {
        if let Err(error) =
            contact_history::backup_headless(&args[2], std::path::Path::new(&args[3]))
        {
            eprintln!("Backup failed: {error:#}");
            std::process::exit(1);
        }
    } else if args.len() == 3 && args[1] == "restore" {
        if let Err(error) = contact_history::restore_headless(std::path::Path::new(&args[2])) {
            eprintln!("Restore failed: {error:#}");
            std::process::exit(1);
        }
    } else if args.len() == 3 && args[1] == "capture" && args[2] == "--due" {
        if let Err(error) = contact_history::capture_due_headless() {
            eprintln!("Due capture failed: {error:#}");
            std::process::exit(1);
        }
    } else {
        contact_history::run();
    }
}
