import { Injectable } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { Observable, switchMap, map } from 'rxjs';
import { AppConnectionsService } from './app-connections.service';
import { AppConnectionType } from '@activepieces/shared';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class GoogleFilePickerService {
  private isPickerApiLoaded$ = new BehaviorSubject<boolean>(false);
  constructor(
    private appConnectionsService: AppConnectionsService,
    private http: HttpClient
  ) {}
  loadGapiScript() {
    if (!this.isPickerApiLoaded$.value) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        this.loadGooglePicker();
      };
      document.body.appendChild(script);
    }
  }

  loadGooglePicker() {
    gapi.load('picker', () => {
      this.isPickerApiLoaded$.next(true);
    });
  }

  getIsPickerLoaded$() {
    return this.isPickerApiLoaded$.asObservable();
  }

  showPicker(connectionName: string, viewId: google.picker.ViewId) {
    return this.appConnectionsService
      .getDecryptedConnection(connectionName)
      .pipe(
        switchMap((connection) => {
          return new Observable<{
            fileId: string;
            fileDisplayName: string;
          } | null>((observer) => {
            if (
              connection.value.type !== AppConnectionType.CLOUD_OAUTH2 &&
              connection.value.type !== AppConnectionType.OAUTH2
            ) {
              console.error(
                `Activepieces: Connection ${connection.name} is not an OAuth2 connection`
              );
              observer.next(null);
              observer.complete();
              return;
            }
            const userDriveView = new google.picker.DocsView(viewId);
            userDriveView.setIncludeFolders(true);
            const sharedDriveView = new google.picker.DocsView(viewId);
            sharedDriveView.setEnableDrives(true).setIncludeFolders(true);
            const appId = connection.value.client_id.split('-')[0];
            const picker = new google.picker.PickerBuilder()
              .addView(userDriveView)
              .addView(sharedDriveView)
              .setAppId(appId)
              .setOAuthToken(connection.value.access_token)
              .setCallback((data: Record<string, any>) => {
                if (
                  data[google.picker.Response.ACTION] ==
                    google.picker.Action.PICKED ||
                  data[google.picker.Response.ACTION] ==
                    google.picker.Action.CANCEL
                ) {
                  const formattedData =
                    data[google.picker.Response.ACTION] ==
                    google.picker.Action.CANCEL
                      ? null
                      : this.pickerCallback(data);
                  observer.next(formattedData);
                  observer.complete();
                  picker.dispose();
                }
              })
              .build();
            picker.setVisible(true);
            setTimeout(() => {
              this.backdropListener(picker);
            }, 100);
          });
        })
      );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pickerCallback(data: Record<string, any>) {
    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
      const doc = data[google.picker.Response.DOCUMENTS][0];
      const fileDisplayName = doc[google.picker.Document.NAME];
      const fileId = doc[google.picker.Document.ID];
      return {
        fileId,
        fileDisplayName,
      };
    }
    return null;
  }

  backdropListener(picker: google.picker.Picker) {
    const backdrop = document.querySelector('div.picker-dialog-bg');
    if (backdrop) {
      const callback = () => {
        backdrop.removeEventListener('click', callback);
        picker.setVisible(false);
        picker.dispose();
      };
      backdrop.addEventListener('click', callback);
    }
  }

  getFileName({
    fileId,
    connectionName,
  }: {
    fileId: string;
    connectionName: string;
  }) {
    return this.appConnectionsService
      .getDecryptedConnection(connectionName)
      .pipe(
        switchMap((res) => {
          if (
            res.value.type !== AppConnectionType.CLOUD_OAUTH2 &&
            res.value.type !== AppConnectionType.OAUTH2
          ) {
            console.error(
              `Activepieces: Connection ${res.name} is not an OAuth2 connection`
            );
            return of('');
          }
          return this.http
            .get<{ name: string }>(
              `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`,
              {
                headers: {
                  Authorization: `Bearer ${res.value.access_token}`,
                },
              }
            )
            .pipe(map((res) => res.name));
        })
      );
  }
}